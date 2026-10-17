import { beforeEach, expect, test } from 'bun:test';
import { and, eq, lte, sql } from 'drizzle-orm';
import { D } from '../../src/lib/money';
import { db } from '../../src/lib/server/db';
import { accounts, companies, journalEntries, journalLines, transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { getDashboard } from '../../src/lib/server/reports/dashboard';
import { getIncomeStatement } from '../../src/lib/server/reports/income-statement';
import { accountIdByCode, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);
const TODAY = '2026-10-18';

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
	return { companyId, bankAccountId };
}

async function addTxns(companyId: string, accountNo: string, rows: Array<{ d: string; date: string; debit?: string; credit?: string; code: string }>) {
	const u = await makeUser();
	const { uploadId } = await makeUpload(companyId, u.id, rows.map((r) => ({ date: r.date, description: r.d, debit: r.debit, credit: r.credit })), { accountNo });
	for (const r of rows)
		await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, r.code) }).where(eq(transactions.description, r.d));
	await generateJournal(companyId, uploadId, u.id);
}

async function insertClosing(companyId: string, date: string) {
	const accs = await db.select({ id: accounts.id, type: accounts.type }).from(accounts).where(eq(accounts.companyId, companyId));
	const type = new Map(accs.map((a) => [a.id, a.type]));
	const rows = await db
		.select({ accountId: journalLines.accountId, net: sql<string>`sum(${journalLines.debit} - ${journalLines.credit})` })
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.where(and(eq(journalEntries.companyId, companyId), lte(journalEntries.entryDate, date)))
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
	const [je] = await db.insert(journalEntries).values({ companyId, type: 'CLOSING', entryDate: date, description: 'Penutup' }).returning({ id: journalEntries.id });
	await db.insert(journalLines).values(lines.map((l) => ({ journalId: je.id, ...l })));
}

test('profitLoss months match the income statement', async () => {
	const { companyId } = await books();
	const d = await getDashboard(companyId, 'admin', TODAY);
	expect(d.profitLoss.map((m) => m.month)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`));
	expect(d.profitLoss.filter((m) => m.future).map((m) => m.month)).toEqual(['2026-11', '2026-12']);
	for (const m of d.profitLoss.filter((x) => !x.future)) {
		const last = new Date(Date.UTC(2026, Number(m.month.slice(5)), 0)).getUTCDate();
		const is = await getIncomeStatement(companyId, { from: `${m.month}-01`, to: `${m.month}-${last}` });
		expect(m.netProfit).toBe(is.netProfit);
	}
	expect(d.profitLoss[2]).toMatchObject({ revenue: '4850000.00', expense: '1700000.00', netProfit: '3150000.00' });
	expect(d.profitLoss[11]).toMatchObject({ revenue: '0.00', expense: '0.00', netProfit: '0.00', future: true });
});

test('profitLoss follows a non-January fiscal year and ignores closing journals', async () => {
	const { companyId } = await books();
	await db.update(companies).set({ fiscalYear: 'APRIL' }).where(eq(companies.id, companyId));
	await addTxns(companyId, 'FY', [
		{ d: 'FYJUAL', date: '2026-05-10', credit: '2000000', code: '4-1001' },
		{ d: 'FYBEBAN', date: '2026-08-12', debit: '500000', code: '5-2010' }
	]);
	const before = (await getDashboard(companyId, 'admin', TODAY)).profitLoss;
	expect(before[0].month).toBe('2026-04');
	expect(before[11].month).toBe('2027-03');
	expect(before.find((m) => m.month === '2026-05')).toMatchObject({ revenue: '2000000.00', expense: '0.00', netProfit: '2000000.00' });
	expect(before.find((m) => m.month === '2026-08')).toMatchObject({ revenue: '0.00', expense: '500000.00', netProfit: '-500000.00' });
	// Data Maret 2026 berada di tahun buku sebelumnya.
	expect(before.every((m) => m.month !== '2026-03')).toBe(true);
	for (const m of before.filter((x) => !x.future)) {
		const last = new Date(Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5)), 0)).getUTCDate();
		expect(m.netProfit).toBe((await getIncomeStatement(companyId, { from: `${m.month}-01`, to: `${m.month}-${last}` })).netProfit);
	}
	await insertClosing(companyId, '2026-09-30');
	const after = await getDashboard(companyId, 'admin', TODAY);
	expect(after.profitLoss).toEqual(before);
});

test('composition keeps positive accounts, top five plus Lainnya', async () => {
	const { companyId } = await books();
	const d = await getDashboard(companyId, 'admin', TODAY);
	expect(d.composition.expense.slices.map((s) => [s.amount])).toEqual([['1000000.00'], ['400000.00'], ['300000.00']]);
	expect(d.composition.expense.total).toBe('1700000.00');
	const rev = new Map(d.composition.revenue.slices.map((s) => [s.accountId, s.amount]));
	expect(d.composition.revenue.slices).toHaveLength(2);
	expect(rev.get(await accountIdByCode(companyId, '4-1001'))).toBe('5000000.00');
	expect(rev.get(await accountIdByCode(companyId, '4-2001'))).toBe('50000.00');
	expect(rev.has(await accountIdByCode(companyId, '4-1003'))).toBe(false);
	expect(d.composition.revenue.total).toBe('5050000.00');

	const u = await makeUser();
	const leafExp = await db
		.select({ id: accounts.id, parentId: accounts.parentId, code: accounts.code, type: accounts.type })
		.from(accounts)
		.where(eq(accounts.companyId, companyId));
	const parents = new Set(leafExp.map((a) => a.parentId));
	const extra = leafExp.filter((a) => a.type === 'EXPENSE' && !parents.has(a.id) && !['5-1001', '5-3003', '5-2010'].includes(a.code)).slice(0, 6);
	expect(extra).toHaveLength(6);
	const rows = extra.map((a, i) => ({ d: `X${i}`, date: '2026-04-01', debit: String(1000 + i), code: a.code }));
	const { uploadId } = await makeUpload(companyId, u.id, rows.map((r) => ({ date: r.date, description: r.d, debit: r.debit })), { accountNo: 'EXTRA' });
	for (const r of rows)
		await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, r.code) }).where(eq(transactions.description, r.d));
	await generateJournal(companyId, uploadId, u.id);
	const e = (await getDashboard(companyId, 'admin', TODAY)).composition.expense;
	expect(e.slices).toHaveLength(6);
	expect(e.slices[5]).toMatchObject({ accountId: null, name: 'Lainnya' });
	expect(e.total).toBe(D(e.slices.reduce((acc, s) => acc.plus(s.amount), D(0))).toFixed(2));
	expect(e.slices.every((s) => typeof s.percent === 'number')).toBe(true);
});

test('bankTrend is cumulative month-end balance and null without a bank account', async () => {
	const { companyId } = await books();
	const d = await getDashboard(companyId, 'admin', TODAY);
	expect(d.bankTrend).toHaveLength(12);
	expect(d.bankTrend!.at(-1)!.month).toBe('2026-10');
	expect(d.bankTrend![0].month).toBe('2025-11');
	expect(d.bankTrend!.find((b) => b.month === '2026-02')!.balance).toBe('10000000.00');
	expect(d.bankTrend!.find((b) => b.month === '2026-03')!.balance).toBe(d.bank!.balance);
	// Transaksi sebelum jendela 12 bulan masuk ke saldo awal tren (bucket PRE).
	await addTxns(companyId, 'OLD', [{ d: 'LAMA', date: '2025-06-10', credit: '700000', code: '4-1001' }]);
	const e = await getDashboard(companyId, 'admin', TODAY);
	expect(e.bankTrend![0]).toEqual({ month: '2025-11', balance: '700000.00' });
	expect(e.bankTrend!.find((b) => b.month === '2026-02')!.balance).toBe('10700000.00');
	expect(e.bankTrend!.at(-1)!.balance).toBe(e.bank!.balance);
	await db.update(companies).set({ bankAccountId: null }).where(eq(companies.id, companyId));
	expect((await getDashboard(companyId, 'admin', TODAY)).bankTrend).toBeNull();
});

test('empty company dashboard does not fail', async () => {
	const { companyId } = await makeCompany();
	const d = await getDashboard(companyId, 'admin', TODAY);
	expect(d.profitLoss).toHaveLength(12);
	expect(d.profitLoss.every((m) => m.revenue === '0.00' && m.expense === '0.00' && m.netProfit === '0.00')).toBe(true);
	expect(d.composition.expense.slices).toEqual([]);
	expect(d.composition.revenue.slices).toEqual([]);
	expect(d.composition.expense.total).toBe('0.00');
});
