import { beforeEach, expect, test } from 'bun:test';
import { and, eq, lte, sql } from 'drizzle-orm';
import { D } from '../../src/lib/money';
import { db } from '../../src/lib/server/db';
import { accounts, journalEntries, journalLines, transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { getBalanceSheet } from '../../src/lib/server/reports/balance-sheet';
import { getIncomeStatement } from '../../src/lib/server/reports/income-statement';
import { getTrialBalance } from '../../src/lib/server/reports/trial-balance';
import { accountIdByCode, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function books() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-01-01',
		lines: [
			{ accountId: bankAccountId, debit: '10000000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '10000000' }
		]
	});
	const rows = [
		{ d: 'JUAL', date: '2026-03-01', credit: '5000000', code: '4-1001' },
		{ d: 'RETUR', date: '2026-03-02', debit: '200000', code: '4-1003' },
		{ d: 'HPP', date: '2026-03-03', debit: '1000000', code: '5-1001' },
		{ d: 'OPS', date: '2026-03-04', debit: '300000', code: '5-2010' },
		{ d: 'BUNGA', date: '2026-03-05', credit: '50000', code: '4-2001' },
		{ d: 'PAJAK', date: '2026-03-06', debit: '400000', code: '5-3003' }
	];
	const { uploadId } = await makeUpload(
		companyId,
		u.id,
		rows.map((r) => ({ date: r.date, description: r.d, debit: r.debit, credit: r.credit }))
	);
	for (const r of rows)
		await db
			.update(transactions)
			.set({ isConfirmed: true, accountId: await accountIdByCode(companyId, r.code) })
			.where(eq(transactions.description, r.d));
	await generateJournal(companyId, uploadId, u.id);
	return { companyId };
}


/** Jurnal CLOSING manual 2026-12-31: membalik saldo tiap akun REVENUE/EXPENSE 2026 ke 3-1003. */
async function insertClosing(companyId: string) {
	const accs = await db.select({ id: accounts.id, type: accounts.type }).from(accounts).where(eq(accounts.companyId, companyId));
	const type = new Map(accs.map((a) => [a.id, a.type]));
	const rows = await db
		.select({ accountId: journalLines.accountId, net: sql<string>`sum(${journalLines.debit} - ${journalLines.credit})` })
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.where(and(eq(journalEntries.companyId, companyId), lte(journalEntries.entryDate, '2026-12-31')))
		.groupBy(journalLines.accountId);
	const lines: { accountId: string; debit: string; credit: string }[] = [];
	let total = D(0);
	for (const r of rows) {
		const t = type.get(r.accountId);
		if (t !== 'REVENUE' && t !== 'EXPENSE') continue;
		const net = D(r.net);
		if (net.isZero()) continue;
		total = total.plus(net);
		lines.push({ accountId: r.accountId, debit: net.lt(0) ? net.neg().toFixed(2) : '0.00', credit: net.gt(0) ? net.toFixed(2) : '0.00' });
	}
	lines.push({
		accountId: await accountIdByCode(companyId, '3-1003'),
		debit: total.lt(0) ? '0.00' : total.toFixed(2),
		credit: total.lt(0) ? total.neg().toFixed(2) : '0.00'
	});
	const [je] = await db
		.insert(journalEntries)
		.values({ companyId, type: 'CLOSING', entryDate: '2026-12-31', description: 'Penutup 2026' })
		.returning({ id: journalEntries.id });
	await db.insert(journalLines).values(lines.map((l) => ({ journalId: je.id, ...l })));
}

const eqLine = (bs: Awaited<ReturnType<typeof getBalanceSheet>>, name: string) => bs.equity.lines.find((l) => l.name === name);

test('balance sheet ignores closing of the as-of fiscal year', async () => {
	const { companyId } = await books();
	const before26 = await getBalanceSheet(companyId, '2026-12-31');
	const before27 = await getBalanceSheet(companyId, '2027-01-31');
	await insertClosing(companyId);
	const a = await getBalanceSheet(companyId, '2026-12-31');
	expect(eqLine(a, 'Laba (Rugi) Tahun Berjalan')?.amount).toBe('3150000.00');
	expect(a.equity.lines.find((l) => l.code === '3-1003')).toBeUndefined();
	expect(a.equity.total).toBe(before26.equity.total);
	expect(a.totalLiabilitiesAndEquity).toBe(before26.totalLiabilitiesAndEquity);
	expect(a.balanced).toBe(true);
	const b = await getBalanceSheet(companyId, '2027-01-31');
	expect(b.equity.lines.find((l) => l.code === '3-1003')?.amount).toBe('3150000.00');
	expect(eqLine(b, 'Laba (Rugi) Tahun-tahun Lalu')).toBeUndefined();
	expect(b.equity.total).toBe(before27.equity.total);
	expect(b.totalLiabilitiesAndEquity).toBe(before27.totalLiabilitiesAndEquity);
	expect(b.balanced).toBe(true);
});

test('income statement ignores closing journals', async () => {
	const { companyId } = await books();
	await insertClosing(companyId);
	expect((await getIncomeStatement(companyId, { from: '2026-01-01', to: '2026-12-31' })).netProfit).toBe('3150000.00');
});

test('trial balance excludes closing from movement unless asked', async () => {
	const { companyId } = await books();
	await insertClosing(companyId);
	const range = { from: '2026-01-01', to: '2026-12-31' };
	const plain = await getTrialBalance(companyId, range);
	expect(plain.rows.find((r) => r.code === '4-1001')?.closingCredit).toBe('5000000.00');
	expect(plain.balanced).toBe(true);
	const withClosing = await getTrialBalance(companyId, range, { includeClosing: true });
	// Baris tetap tampil karena ada mutasi (debit = kredit), tetapi saldo akhirnya nol.
	expect(withClosing.rows.find((r) => r.code === '4-1001')).toMatchObject({ closingDebit: '0.00', closingCredit: '0.00' });
	expect(withClosing.rows.find((r) => r.code === '3-1003')?.closingCredit).toBe('3150000.00');
	expect(withClosing.balanced).toBe(true);
	const next = await getTrialBalance(companyId, { from: '2027-01-01', to: '2027-01-31' });
	expect(next.rows.find((r) => r.code === '3-1003')?.openingCredit).toBe('3150000.00');
	expect(next.rows.filter((r) => /^[45]-/.test(r.code))).toEqual([]);
	expect(next.balanced).toBe(true);
});
