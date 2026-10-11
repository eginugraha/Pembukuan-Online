import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { categoryRules, journalEntries, statementUploads, transactions } from '../../src/lib/server/db/schema';
import { bulkConfirm, confirmTransaction } from '../../src/lib/server/transactions/confirm';
import { PATCH } from '../../src/routes/api/transactions/[id]/confirm/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUpload, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const txn = (id: string) => db.query.transactions.findFirst({ where: eq(transactions.id, id) });
const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

async function setup() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const gaji = await accountIdByCode(companyId, '5-2001');
	const { uploadId, txnIds } = await makeUpload(
		companyId,
		null,
		[
			{ description: 'TRSF E-BANKING DB Payroll August BUDI', debit: '5000000' },
			{ description: 'TRSF E-BANKING DB Payroll August SITI', debit: '5100000' },
			{ description: 'TRSF E-BANKING CR Payroll refund', credit: '100000' },
			{ description: 'LAIN-LAIN', debit: '1000' }
		],
		{ status: 'review' }
	);
	return { companyId, u, gaji, uploadId, txnIds };
}

test('confirm with rule propagates to same-direction pending transactions', async () => {
	const { companyId, u, gaji, txnIds } = await setup();
	const res = await confirmTransaction(companyId, u.id, txnIds[0], { accountId: gaji, rule: { keyword: ' payroll ' } });
	expect(res.propagated).toBe(1);
	expect(await txn(txnIds[0])).toMatchObject({ isConfirmed: true, accountId: gaji, source: 'USER', confirmedBy: u.id });
	expect(await txn(txnIds[1])).toMatchObject({ isConfirmed: true, accountId: gaji, source: 'RULE' });
	expect((await txn(txnIds[2]))?.isConfirmed).toBe(false); // arah CR tidak terkena rule DB
	const [rule] = await db.select().from(categoryRules).where(eq(categoryRules.keywordPattern, 'PAYROLL'));
	expect(rule).toMatchObject({ source: 'USER', priority: 100, direction: 'DB', accountId: gaji });
});

test('source is AI when user accepts the AI suggestion; upload becomes done when all confirmed', async () => {
	const { companyId, u, gaji, uploadId, txnIds } = await setup();
	await db.update(transactions).set({ aiSuggestedAccountId: gaji, aiConfidence: '0.700', source: 'AI' }).where(eq(transactions.id, txnIds[3]));
	await confirmTransaction(companyId, u.id, txnIds[3], { accountId: gaji });
	expect((await txn(txnIds[3]))?.source).toBe('AI');
	const lain = await accountIdByCode(companyId, '4-2002');
	for (const id of txnIds.slice(0, 3)) await confirmTransaction(companyId, u.id, id, { accountId: lain });
	expect((await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, uploadId) }))?.status).toBe('done');
});

test('rejects journaled, invalid account, short keyword and foreign transaction', async () => {
	const { companyId, u, gaji, txnIds } = await setup();
	const other = await makeCompany('PT Lain');
	expect(await codeOf(confirmTransaction(companyId, u.id, txnIds[0], { accountId: await accountIdByCode(companyId, '5-2000') }))).toBe('invalid_account');
	expect(await codeOf(confirmTransaction(companyId, u.id, txnIds[0], { accountId: gaji, rule: { keyword: 'ab' } }))).toBe('invalid_keyword');
	expect(await codeOf(confirmTransaction(other.companyId, u.id, txnIds[0], { accountId: gaji }))).toBe('not_found');
	await db.insert(journalEntries).values({ companyId, type: 'TRANSACTION', transactionId: txnIds[0], entryDate: '2026-08-15' });
	expect(await codeOf(confirmTransaction(companyId, u.id, txnIds[0], { accountId: gaji }))).toBe('transaction_journaled');
});

test('bulk confirm accepts suggestions above threshold and learns keywords', async () => {
	const { companyId, u, gaji, uploadId, txnIds } = await setup();
	await db.update(transactions).set({ aiSuggestedAccountId: gaji, aiConfidence: '0.900', aiKeyword: 'PAYROLL AUGUST', source: 'AI' }).where(eq(transactions.id, txnIds[0]));
	await db.update(transactions).set({ aiSuggestedAccountId: gaji, aiConfidence: '0.500', source: 'AI' }).where(eq(transactions.id, txnIds[3]));
	const res = await bulkConfirm(companyId, u.id, { uploadId, minConfidence: 0.8 });
	expect(res).toEqual({ confirmed: 1, propagated: 1 });
	expect((await txn(txnIds[1]))?.source).toBe('RULE');
	expect((await txn(txnIds[3]))?.isConfirmed).toBe(false);
});

test('API: viewer cannot confirm', async () => {
	const { companyId, gaji, txnIds } = await setup();
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const ev = fakeEvent({ ctx: await contextFor(viewer), method: 'PATCH', params: { id: txnIds[0] }, body: { accountId: gaji } });
	expect((await call(PATCH, ev)).status).toBe(403);
});
