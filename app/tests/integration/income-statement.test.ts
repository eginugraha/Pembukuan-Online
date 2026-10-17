import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { companies, transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { getBalanceSheet } from '../../src/lib/server/reports/balance-sheet';
import { getIncomeStatement, getIncomeStatementComparative } from '../../src/lib/server/reports/income-statement';
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

const full = { from: '2026-01-01', to: '2026-12-31' };

test('PSAK sections and subtotals', async () => {
	const { companyId } = await books();
	const is = await getIncomeStatement(companyId, full);
	expect(is.sections.map((s) => s.title)).toEqual([
		'Pendapatan Usaha',
		'Beban Pokok Pendapatan',
		'Beban Operasional',
		'Pendapatan Lain-lain',
		'Beban Lain-lain',
		'Beban Pajak Penghasilan'
	]);
	const s = Object.fromEntries(is.sections.map((x) => [x.key, x]));
	expect(s.revenue.total).toBe('4800000.00');
	expect(s.revenue.lines.find((l) => l.code === '4-1003')?.amount).toBe('-200000.00');
	expect(s.cogs.total).toBe('1000000.00');
	expect(is.grossProfit).toBe('3800000.00');
	expect(s.opex.total).toBe('300000.00');
	expect(is.operatingProfit).toBe('3500000.00');
	expect(s.otherIncome.total).toBe('50000.00');
	expect(s.otherExpense.total).toBe('0.00');
	expect(s.otherExpense.lines).toEqual([]);
	expect(is.profitBeforeTax).toBe('3550000.00');
	expect(s.tax.total).toBe('400000.00');
	expect(is.netProfit).toBe('3150000.00');
});

test('net profit equals balance sheet current-year profit', async () => {
	const { companyId } = await books();
	const is = await getIncomeStatement(companyId, { from: '2026-01-01', to: '2026-08-31' });
	expect(is.netProfit).toBe((await getBalanceSheet(companyId, '2026-08-31')).profit.thisYear);
});

test('comparative is the same period one year earlier with identical rows', async () => {
	const { companyId } = await books();
	const { current, comparative } = await getIncomeStatementComparative(companyId, full);
	expect(comparative.from).toBe('2025-01-01');
	expect(comparative.to).toBe('2025-12-31');
	current.sections.forEach((sec, i) =>
		expect(comparative.sections[i].lines.map((l) => l.accountId)).toEqual(sec.lines.map((l) => l.accountId))
	);
	expect(comparative.netProfit).toBe('0.00');
});

test('non-January fiscal year: period is whatever range is passed', async () => {
	const { companyId } = await books();
	await db.update(companies).set({ fiscalYear: 'JULY' }).where(eq(companies.id, companyId));
	const is = await getIncomeStatement(companyId, { from: '2025-07-01', to: '2026-06-30' });
	expect(is.netProfit).toBe('3150000.00');
});
