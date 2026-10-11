import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { categoryRules, journalEntries, journalLines, statementUploads, transactions } from '../../src/lib/server/db/schema';
import { runCategorization } from '../../src/lib/server/categorize/pipeline';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { createRule } from '../../src/lib/server/rules/service';
import { bulkConfirm, confirmTransaction } from '../../src/lib/server/transactions/confirm';
import { createUpload } from '../../src/lib/server/uploads/service';
import type { ParsedStatement } from '../../src/lib/server/uploads/sidecar-client';
import { accountIdByCode, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};
const txn = (id: string) => db.query.transactions.findFirst({ where: eq(transactions.id, id) });

test('bank account cannot be a transaction category or rule target', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const { txnIds } = await makeUpload(companyId, null, [{ description: 'SETORAN TUNAI', credit: '1000' }]);
	expect(await codeOf(confirmTransaction(companyId, u.id, txnIds[0], { accountId: bankAccountId }))).toBe('bank_account_not_allowed');
	expect(await codeOf(createRule(companyId, { keyword: 'SETORAN', accountId: bankAccountId }))).toBe('bank_account_not_allowed');
});

test('generateJournal refuses a transaction categorized to the bank account', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const { uploadId } = await makeUpload(companyId, null, [{ description: 'SETORAN TUNAI', credit: '1000' }]);
	await db.update(transactions).set({ isConfirmed: true, accountId: bankAccountId });
	expect(await codeOf(generateJournal(companyId, uploadId, u.id))).toBe('bank_account_not_allowed');
	expect(await db.select().from(journalEntries)).toHaveLength(0);
});

test('bulk confirm skips bank-account suggestions', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const { uploadId } = await makeUpload(companyId, null, [{ description: 'SETORAN TUNAI', credit: '1000' }]);
	await db.update(transactions).set({ aiSuggestedAccountId: bankAccountId, aiConfidence: '0.950', source: 'AI' });
	expect(await bulkConfirm(companyId, u.id, { uploadId })).toEqual({ confirmed: 0, propagated: 0 });
});

test('bulk confirm learns only AI keywords that appear in the source description', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const beban = await accountIdByCode(companyId, '5-2013');
	const { uploadId, txnIds } = await makeUpload(companyId, null, [
		{ description: 'TRSF DB KE VENDOR ALPHA', debit: '500000' },
		{ description: 'TRANSFER GAJI KARYAWAN', debit: '700000' }
	]);
	await db
		.update(transactions)
		.set({ aiSuggestedAccountId: beban, aiConfidence: '0.900', aiKeyword: 'TRANSFER', source: 'AI' })
		.where(eq(transactions.id, txnIds[0]));
	expect(await bulkConfirm(companyId, u.id, { uploadId })).toEqual({ confirmed: 1, propagated: 0 });
	expect(await db.select().from(categoryRules).where(eq(categoryRules.keywordPattern, 'TRANSFER'))).toHaveLength(0);
	expect((await txn(txnIds[1]))?.isConfirmed).toBe(false);
});

test('AI write-back leaves a transaction confirmed mid-run untouched', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const pendapatan = await accountIdByCode(companyId, '4-1001');
	const { uploadId, txnIds } = await makeUpload(companyId, null, [{ description: 'TRANSFER MASUK KLIEN', credit: '1000' }]);
	await runCategorization(uploadId, async (groups) => {
		await confirmTransaction(companyId, u.id, txnIds[0], { accountId: pendapatan });
		return {
			ok: true,
			suggestions: [{ groupId: groups[0].groupId, accountCode: '5-2010', confidence: 0.9, reason: 'x', keyword: null }]
		};
	});
	expect(await txn(txnIds[0])).toMatchObject({ source: 'USER', accountId: pendapatan, aiSuggestedAccountId: null });
});

test('concurrent saveOpening calls leave exactly one OPENING entry', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const modal = await accountIdByCode(companyId, '3-1001');
	const input = {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '1000', credit: '0' },
			{ accountId: modal, debit: '0', credit: '1000' }
		]
	};
	await Promise.all(Array.from({ length: 6 }, () => saveOpening(companyId, u.id, input)));
	expect(await db.select().from(journalEntries).where(eq(journalEntries.type, 'OPENING'))).toHaveLength(1);
	expect(await db.select().from(journalLines)).toHaveLength(2);
});

test('concurrent uploads of the same statement: one stored, one rejected as duplicate', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const parsed: ParsedStatement = {
		account_no: '1234567890',
		period_start: '2026-08-01',
		period_end: '2026-08-31',
		opening_balance: '0.00',
		closing_balance: '1000.00',
		transactions: [{ line_no: 1, date: '2026-08-05', description: 'TRSF MASUK', amount: '1000.00', direction: 'CR', balance: null }]
	};
	const file = () => new File([new TextEncoder().encode('%PDF-1.4 x')], 'st.pdf', { type: 'application/pdf' });
	const deps = { parse: async () => parsed, enqueue: () => {} };
	const results = await Promise.allSettled([
		createUpload({ companyId, userId: u.id, file: file() }, deps),
		createUpload({ companyId, userId: u.id, file: file() }, deps)
	]);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
	expect(rejected.reason.code).toBe('duplicate_statement');
	expect(await db.select().from(statementUploads)).toHaveLength(1);
});
