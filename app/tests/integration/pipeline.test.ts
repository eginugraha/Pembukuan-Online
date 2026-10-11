import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { statementUploads, transactions } from '../../src/lib/server/db/schema';
import { runCategorization, type SuggestFn } from '../../src/lib/server/categorize/pipeline';
import { OllamaUnavailableError, type AiAccount, type AiGroup } from '../../src/lib/server/categorize/ollama';
import { configureJobs, enqueueCategorization, jobsIdle } from '../../src/lib/server/jobs';
import { accountIdByCode, makeCompany, makeUpload } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const upload = (id: string) => db.query.statementUploads.findFirst({ where: eq(statementUploads.id, id) });
const txns = (uploadId: string) =>
	db.select().from(transactions).where(eq(transactions.uploadId, uploadId)).orderBy(transactions.lineNo);

test('rules confirm, AI suggests per group, bank account hidden from AI', async () => {
	const { companyId } = await makeCompany();
	const { uploadId } = await makeUpload(companyId, null, [
		{ description: 'BIAYA ADM', debit: '30000' },
		{ description: 'TRSF E-BANKING DB 3108/A Payroll August 26 BUDI', debit: '5000000' },
		{ description: 'TRSF E-BANKING DB 3108/B Payroll August 26 BUDI', debit: '5100000' },
		{ description: 'TRANSFER MASUK KLIEN', credit: '9000000' }
	]);
	const seen: { groups: AiGroup[]; accounts: AiAccount[] }[] = [];
	const suggest: SuggestFn = async (groups, accounts) => {
		seen.push({ groups, accounts });
		return {
			ok: true,
			suggestions: groups.map((g) => ({
				groupId: g.groupId,
				accountCode: g.direction === 'DB' ? '5-2001' : '4-1001',
				confidence: g.direction === 'DB' ? 0.95 : 0.6,
				reason: 'uji',
				keyword: g.direction === 'DB' ? 'PAYROLL' : null
			}))
		};
	};
	await runCategorization(uploadId, suggest);

	expect(seen).toHaveLength(1);
	expect(seen[0].groups).toHaveLength(2); // dua payroll dengan deskripsi sama digabung
	expect(seen[0].accounts.some((a) => a.code === '1-1002')).toBe(false);
	const rows = await txns(uploadId);
	expect(rows[0]).toMatchObject({ isConfirmed: true, source: 'RULE' });
	const gaji = await accountIdByCode(companyId, '5-2001');
	for (const r of [rows[1], rows[2]]) {
		expect(r).toMatchObject({ isConfirmed: false, source: 'AI', aiSuggestedAccountId: gaji, aiConfidence: '0.950', aiKeyword: 'PAYROLL' });
	}
	expect(rows[3].aiSuggestedAccountId).toBe(await accountIdByCode(companyId, '4-1001'));
	expect(await upload(uploadId)).toMatchObject({ status: 'review', aiStatus: 'ok' });
});

test('Ollama down: no suggestions, status review, aiStatus unavailable', async () => {
	const { companyId } = await makeCompany();
	const { uploadId } = await makeUpload(companyId, null, [{ description: 'TRANSFER MASUK', credit: '1000' }]);
	await runCategorization(uploadId, async () => {
		throw new OllamaUnavailableError('down');
	});
	expect(await upload(uploadId)).toMatchObject({ status: 'review', aiStatus: 'unavailable' });
	expect((await txns(uploadId))[0].aiSuggestedAccountId).toBeNull();
});

test('failed batch marks partial; all-rule upload becomes done', async () => {
	const { companyId } = await makeCompany();
	const a = await makeUpload(companyId, null, [{ description: 'TRANSFER MASUK', credit: '1000' }], { accountNo: 'A' });
	await runCategorization(a.uploadId, async () => ({ ok: false, suggestions: [] }));
	expect(await upload(a.uploadId)).toMatchObject({ status: 'review', aiStatus: 'partial' });

	const b = await makeUpload(companyId, null, [{ description: 'BIAYA ADM', debit: '30000' }], { accountNo: 'B' });
	let called = false;
	await runCategorization(b.uploadId, async () => {
		called = true;
		return { ok: true, suggestions: [] };
	});
	expect(called).toBe(false);
	expect(await upload(b.uploadId)).toMatchObject({ status: 'done', aiStatus: 'ok' });
});

test('job runner processes queue and records unexpected errors', async () => {
	const { companyId } = await makeCompany();
	const ok = await makeUpload(companyId, null, [{ description: 'BIAYA ADM', debit: '1' }], { accountNo: 'A' });
	const bad = await makeUpload(companyId, null, [{ description: 'APA INI', debit: '1' }], { accountNo: 'B' });
	configureJobs({
		suggest: async () => {
			throw new Error('kaboom');
		}
	});
	enqueueCategorization(ok.uploadId);
	enqueueCategorization(bad.uploadId);
	await jobsIdle();
	expect((await upload(ok.uploadId))?.status).toBe('done');
	expect(await upload(bad.uploadId)).toMatchObject({ status: 'error', errorMessage: 'kaboom' });
});
