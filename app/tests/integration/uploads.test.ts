import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { statementUploads, transactions } from '../../src/lib/server/db/schema';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { runCategorization } from '../../src/lib/server/categorize/pipeline';
import { createUpload, deleteUpload, getUpload, type UploadDeps } from '../../src/lib/server/uploads/service';
import type { ParsedStatement } from '../../src/lib/server/uploads/sidecar-client';
import { GET as GET_ONE, DELETE } from '../../src/routes/api/uploads/[id]/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const pdf = (name = 'st.pdf', bytes: BlobPart = new TextEncoder().encode('%PDF-1.4 fake')) =>
	new File([bytes], name, { type: 'application/pdf' });

const statement = (over: Partial<ParsedStatement> = {}): ParsedStatement => ({
	account_no: '1234567890',
	period_start: '2026-08-01',
	period_end: '2026-08-31',
	opening_balance: '1000000.00',
	closing_balance: '970000.00',
	transactions: [
		{ line_no: 1, date: '2026-08-02', description: 'BIAYA ADM 0998', amount: '30000.00', direction: 'DB', balance: '970000.00' },
		{ line_no: 2, date: '2026-08-05', description: 'TRSF MASUK 0508/X PELANGGAN', amount: '50000.00', direction: 'CR', balance: null }
	],
	...over
});

function deps(st: ParsedStatement) {
	const enqueued: string[] = [];
	const d: UploadDeps = { parse: async () => st, enqueue: (id) => enqueued.push(id) };
	return { d, enqueued };
}

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('stores upload and transactions, then enqueues categorization', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { d, enqueued } = deps(statement());
	const res = await createUpload({ companyId, userId: u.id, file: pdf() }, d);
	expect(enqueued).toEqual([res.id]);
	expect(res.balanceWarning).toBeNull();
	const up = await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, res.id) });
	expect(up).toMatchObject({ status: 'processing', accountNo: '1234567890', openingBalance: '1000000.00', filename: 'st.pdf' });
	const rows = await db.select().from(transactions).where(eq(transactions.uploadId, res.id)).orderBy(transactions.lineNo);
	expect(rows[0]).toMatchObject({ debit: '30000.00', credit: '0.00', groupKey: 'BIAYA ADM', balance: '970000.00', txnDate: '2026-08-02' });
	expect(rows[1]).toMatchObject({ debit: '0.00', credit: '50000.00', balance: null });
});

test('validates file name, magic bytes and size', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { d } = deps(statement());
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf('st.txt') }, d))).toBe('invalid_file');
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf('st.pdf', new TextEncoder().encode('hello')) }, d))).toBe('invalid_file');
	const big = new Uint8Array(10 * 1024 * 1024 + 1);
	big.set(new TextEncoder().encode('%PDF'));
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf('big.pdf', big) }, d))).toBe('file_too_large');
});

test('rejects overlapping statement for same account, allows other account', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement()).d);
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement()).d))).toBe('duplicate_statement');
	const other = await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement({ account_no: '999' })).d);
	expect(other.id).toBeString();
});

test('account number is normalized to digits so formatting differences still count as duplicate', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const res = await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement({ account_no: ' 123-456 7890 ' })).d);
	expect((await getUpload(companyId, res.id)).accountNo).toBe('1234567890');
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement({ account_no: '123.456.7890' })).d))).toBe(
		'duplicate_statement'
	);
});

test('statement without transactions is accepted and settles to done', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const res = await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement({ transactions: [] })).d);
	await runCategorization(res.id, async () => ({ ok: true, suggestions: [] }));
	expect((await getUpload(companyId, res.id)).status).toBe('done');
});

test('warns when PDF opening balance differs from book balance', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '900000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '900000' }
		]
	});
	const res = await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement()).d);
	expect(res.balanceWarning).toContain('1.000.000,00');
	expect(res.balanceWarning).toContain('900.000,00');
	const same = await createUpload({ companyId, userId: u.id, file: pdf() }, deps(statement({ account_no: '2', opening_balance: '900000.00' })).d);
	expect(same.balanceWarning).toBeNull();
});

test('upload of another company is 404; delete requires admin', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const u = await makeUser();
	const res = await createUpload({ companyId: a.companyId, userId: u.id, file: pdf() }, deps(statement()).d);
	expect(await codeOf(getUpload(b.companyId, res.id))).toBe('not_found');
	expect(await codeOf(deleteUpload(b.companyId, res.id))).toBe('not_found');

	const accountant = await makeUser();
	await addMember(accountant.id, a.companyId, 'accountant');
	const admin = await makeUser();
	await addMember(admin.id, a.companyId, 'admin');
	const params = { id: res.id };
	expect((await call(GET_ONE, fakeEvent({ ctx: await contextFor(accountant), params }))).status).toBe(200);
	expect((await call(GET_ONE, fakeEvent({ ctx: await contextFor(accountant), params: { id: 'bukan-uuid' } }))).status).toBe(404);
	expect((await call(DELETE, fakeEvent({ ctx: await contextFor(accountant), method: 'DELETE', params }))).status).toBe(403);
	expect((await call(DELETE, fakeEvent({ ctx: await contextFor(admin), method: 'DELETE', params }))).status).toBe(200);
	expect(await db.select().from(transactions)).toHaveLength(0);
});
