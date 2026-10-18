import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { getLedger } from '../../src/lib/server/reports/ledger';
import { getTrialBalance } from '../../src/lib/server/reports/trial-balance';
import { accountIdByCode, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function booksWithActivity() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const modal = await accountIdByCode(companyId, '3-1001');
	const beban = await accountIdByCode(companyId, '5-2010');
	const pendapatan = await accountIdByCode(companyId, '4-1001');
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '1000000', credit: '0' },
			{ accountId: modal, debit: '0', credit: '1000000' }
		]
	});
	const { uploadId } = await makeUpload(companyId, u.id, [
		{ date: '2026-08-02', description: 'BIAYA ADM', debit: '30000' },
		{ date: '2026-08-05', description: 'TRSF MASUK', credit: '2500000' }
	]);
	await db.update(transactions).set({ isConfirmed: true, accountId: beban }).where(eq(transactions.description, 'BIAYA ADM'));
	await db.update(transactions).set({ isConfirmed: true, accountId: pendapatan }).where(eq(transactions.description, 'TRSF MASUK'));
	await generateJournal(companyId, uploadId, u.id);
	return { companyId, bankAccountId, modal, beban, pendapatan };
}

test('ledger of bank: opening, running balance, closing', async () => {
	const { companyId, bankAccountId } = await booksWithActivity();
	const ledger = await getLedger(companyId, bankAccountId, '2026-08-01', '2026-08-31');
	expect(ledger.openingBalance).toBe('1000000.00');
	expect(ledger.lines.map((l) => [l.refNo, l.debit, l.credit, l.balance])).toEqual([
		['JE-202608-0001', '0.00', '30000.00', '970000.00'],
		['JE-202608-0002', '2500000.00', '0.00', '3470000.00']
	]);
	expect(ledger.closingBalance).toBe('3470000.00');

	const later = await getLedger(companyId, bankAccountId, '2026-09-01', '2026-09-30');
	expect(later.openingBalance).toBe('3470000.00');
	expect(later.lines).toHaveLength(0);
});

test('credit-normal account shows positive balance', async () => {
	const { companyId, pendapatan } = await booksWithActivity();
	const ledger = await getLedger(companyId, pendapatan, '2026-08-01', '2026-08-31');
	expect(ledger.closingBalance).toBe('2500000.00');
});

test('trial balance is balanced and places balances on the natural side', async () => {
	const { companyId } = await booksWithActivity();
	const tb = await getTrialBalance(companyId, { from: '2026-01-01', to: '2026-08-31' });
	expect(tb.balanced).toBe(true);
	expect(tb.totals.closingDebit).toBe('3500000.00');
	expect(tb.totals.closingCredit).toBe('3500000.00');
	const byCode = Object.fromEntries(tb.rows.map((r) => [r.code, [r.closingDebit, r.closingCredit]]));
	expect(byCode['1-1002']).toEqual(['3470000.00', '0.00']);
	expect(byCode['5-2010']).toEqual(['30000.00', '0.00']);
	expect(byCode['3-1001']).toEqual(['0.00', '1000000.00']);
	expect(byCode['4-1001']).toEqual(['0.00', '2500000.00']);

	const before = await getTrialBalance(companyId, { from: '2026-07-01', to: '2026-07-31' });
	expect(before.rows).toHaveLength(0);
	expect(before.balanced).toBe(true);
});

test('ledger for foreign account is 404', async () => {
	const { companyId } = await booksWithActivity();
	const other = await makeCompany('PT Lain');
	await expect(getLedger(companyId, other.bankAccountId, '2026-08-01', '2026-08-31')).rejects.toMatchObject({ code: 'not_found' });
});

test('trial balance still shows an account whose opening and movement net to a zero closing', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '1000000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '1000000' }
		]
	});
	const { uploadId } = await makeUpload(companyId, u.id, [{ date: '2026-08-02', description: 'BAYAR PENUH', debit: '1000000' }]);
	await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, '5-2010') }).where(eq(transactions.description, 'BAYAR PENUH'));
	await generateJournal(companyId, uploadId, u.id);
	const tb = await getTrialBalance(companyId, { from: '2026-08-02', to: '2026-08-31' });
	const bank = tb.rows.find((r) => r.accountId === bankAccountId);
	expect(bank).toMatchObject({ openingDebit: '1000000.00', credit: '1000000.00', closingDebit: '0.00', closingCredit: '0.00' });
});
