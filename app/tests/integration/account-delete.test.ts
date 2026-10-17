import { beforeEach, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, categoryRules, journalEntries, journalLines, transactions } from '../../src/lib/server/db/schema';
import { createAccount } from '../../src/lib/server/accounts/service';
import { deleteAccount, getAccountUsage } from '../../src/lib/server/accounts/delete';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { getLedger } from '../../src/lib/server/reports/ledger';
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
const exists = async (id: string) => (await db.query.accounts.findFirst({ where: eq(accounts.id, id) })) !== undefined;

async function company() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const id = (code: string) => accountIdByCode(companyId, code);
	return { companyId, bankAccountId, u, id };
}

/** Akun 5-2010 dipakai jurnal, transaksi, saran AI, dan rule (rule BIAYA ADM bawaan). */
async function usedExpense() {
	const c = await company();
	const beban = await c.id('5-2010');
	const { uploadId, txnIds } = await makeUpload(c.companyId, c.u.id, [{ date: '2026-08-02', description: 'BIAYA ADM', debit: '30000' }]);
	await db.update(transactions).set({ isConfirmed: true, accountId: beban, aiSuggestedAccountId: beban }).where(eq(transactions.id, txnIds[0]));
	await generateJournal(c.companyId, uploadId, c.u.id);
	return { ...c, beban, txnId: txnIds[0] };
}

test('an unused account is deleted outright', async () => {
	const c = await company();
	const { id: fresh } = await createAccount(c.companyId, 'admin', { code: '5-2099', name: 'Beban Uji', parentId: await c.id('5-2000') });
	expect(await getAccountUsage(c.companyId, fresh)).toEqual({ journalLines: 0, transactions: 0, rules: 0, children: 0, isBankAccount: false });
	await deleteAccount(c.companyId, fresh);
	expect(await exists(fresh)).toBe(false);
});

test('a used account needs a target; with a valid one every reference moves and the account is deleted', async () => {
	const { companyId, beban, id, txnId } = await usedExpense();
	const usage = await getAccountUsage(companyId, beban);
	expect(usage.journalLines).toBe(1);
	expect(usage.transactions).toBe(1);
	expect(usage.rules).toBeGreaterThan(0);

	expect(await codeOf(deleteAccount(companyId, beban))).toBe('move_required');
	expect(await exists(beban)).toBe(true);

	const target = await id('5-2001');
	const rulesBefore = (await db.select().from(categoryRules).where(eq(categoryRules.accountId, beban))).length;
	await deleteAccount(companyId, beban, target);

	expect(await exists(beban)).toBe(false);
	expect(await db.select().from(journalLines).where(eq(journalLines.accountId, beban))).toHaveLength(0);
	const [txn] = await db.select().from(transactions).where(eq(transactions.id, txnId));
	expect([txn.accountId, txn.aiSuggestedAccountId]).toEqual([target, target]);
	expect((await db.select().from(categoryRules).where(eq(categoryRules.accountId, target))).length).toBeGreaterThanOrEqual(rulesBefore);
	expect((await getLedger(companyId, target, '2026-08-01', '2026-08-31')).closingBalance).toBe('30000.00');
});

test('invalid targets are rejected and nothing changes', async () => {
	const { companyId, bankAccountId, beban, id } = await usedExpense();
	const snapshot = async () => ({
		lines: (await db.select().from(journalLines)).map((l) => `${l.id}:${l.accountId}`).sort(),
		txns: (await db.select().from(transactions)).map((t) => `${t.id}:${t.accountId}:${t.aiSuggestedAccountId}`),
		rules: (await db.select().from(categoryRules)).map((r) => `${r.id}:${r.accountId}`).sort()
	});
	const before = await snapshot();

	const inactive = await id('5-2001');
	await db.update(accounts).set({ isActive: false }).where(eq(accounts.id, inactive));
	const bad: Array<[string, string]> = [
		['itself', beban],
		['bank account', bankAccountId],
		['different type', await id('4-1001')],
		['different normal balance', await id('1-2201')],
		['non-leaf', await id('5-2000')],
		['inactive', inactive],
		['unknown', '00000000-0000-4000-8000-000000000000']
	];
	for (const [label, target] of bad) expect([label, await codeOf(deleteAccount(companyId, beban, target))]).toEqual([label, 'invalid_move_target']);

	expect(await exists(beban)).toBe(true);
	expect(await snapshot()).toEqual(before);
});

test('bank account, parents and foreign accounts cannot be deleted', async () => {
	const { companyId, bankAccountId, id } = await company();
	expect(await codeOf(deleteAccount(companyId, bankAccountId))).toBe('bank_account');
	expect(await codeOf(deleteAccount(companyId, await id('5-2000')))).toBe('has_children');
	const other = await makeCompany('PT Lain');
	expect(await codeOf(deleteAccount(other.companyId, await id('5-2010')))).toBe('not_found');
	expect(await codeOf(getAccountUsage(other.companyId, await id('5-2010')))).toBe('not_found');
});

test('opening-balance lines also move with the account', async () => {
	const { companyId, bankAccountId, u, id } = await company();
	const { saveOpening } = await import('../../src/lib/server/journal/opening');
	const modal = await id('3-1001');
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '5000', credit: '0' },
			{ accountId: modal, debit: '0', credit: '5000' }
		]
	});
	const target = await id('3-1002');
	await deleteAccount(companyId, modal, target);
	const [opening] = await db.select().from(journalEntries).where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.type, 'OPENING')));
	expect((await db.select().from(journalLines).where(eq(journalLines.journalId, opening.id))).map((l) => l.accountId)).toContain(target);
});
