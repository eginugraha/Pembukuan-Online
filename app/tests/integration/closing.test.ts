import { beforeEach, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { fiscalClosings, journalEntries, journalLines, transactions } from '../../src/lib/server/db/schema';
import { closeFiscalYear, reopenFiscalYear } from '../../src/lib/server/closing/close';
import { listFiscalYears } from '../../src/lib/server/closing/years';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { getBalanceSheet } from '../../src/lib/server/reports/balance-sheet';
import { accountIdByCode, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const TODAY = '2027-02-10';

async function books(opts: { with2025?: boolean } = {}) {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2025-01-01',
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
	if (opts.with2025) rows.push({ d: 'JUAL25', date: '2025-05-01', credit: '1000000', code: '4-1001' } as never);
	const { uploadId, txnIds } = await makeUpload(
		companyId,
		u.id,
		rows.map((r) => ({ date: r.date, description: r.d, debit: r.debit, credit: r.credit })),
		{ status: 'done' }
	);
	for (const [i, r] of rows.entries())
		await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, r.code) }).where(eq(transactions.id, txnIds[i]));
	await generateJournal(companyId, uploadId, u.id);
	return { companyId, userId: u.id, reId: await accountIdByCode(companyId, '3-1003') };
}

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e) => ({ code: e.code, field: e.field }));

test('closing creates a balanced journal moving profit to retained earnings', async () => {
	const { companyId, userId, reId } = await books();
	const { journalId } = await closeFiscalYear(companyId, userId, { periodStart: '2026-01-01', retainedEarningsAccountId: reId }, TODAY);
	const je = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, journalId!) });
	expect(je).toMatchObject({ type: 'CLOSING', entryDate: '2026-12-31', refNo: 'TUTUP-2026' });
	const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, journalId!));
	const by = async (c: string) => {
		const id = await accountIdByCode(companyId, c);
		return lines.find((l) => l.accountId === id);
	};
	expect((await by('3-1003'))?.credit).toBe('3150000.00');
	expect((await by('4-1001'))?.debit).toBe('5000000.00');
	expect((await by('4-1003'))?.credit).toBe('200000.00');
	const sum = (k: 'debit' | 'credit') => lines.reduce((s, l) => s + Number(l[k]), 0);
	expect(sum('debit')).toBe(sum('credit'));
	expect(await db.query.fiscalClosings.findFirst({ where: eq(fiscalClosings.companyId, companyId) })).toBeTruthy();
});

test('balance sheet totals are identical before and after closing', async () => {
	const { companyId, userId, reId } = await books();
	const dates = ['2026-12-31', '2027-01-31'];
	const before = await Promise.all(dates.map((d) => getBalanceSheet(companyId, d)));
	await closeFiscalYear(companyId, userId, { periodStart: '2026-01-01', retainedEarningsAccountId: reId }, TODAY);
	const after = await Promise.all(dates.map((d) => getBalanceSheet(companyId, d)));
	for (const i of [0, 1]) {
		expect(after[i].assets.total).toBe(before[i].assets.total);
		expect(after[i].liabilities.total).toBe(before[i].liabilities.total);
		expect(after[i].equity.total).toBe(before[i].equity.total);
	}
});

test('closing preconditions', async () => {
	const start = '2026-01-01';
	// (a)
	{
		const { companyId, userId, reId } = await books();
		await makeUpload(companyId, userId, [{ date: '2026-08-15', description: 'X', debit: '1000' }]);
		expect(await code(closeFiscalYear(companyId, userId, { periodStart: start, retainedEarningsAccountId: reId }, TODAY))).toMatchObject({ code: 'pending_transactions' });
	}
	await resetDb();
	// (b)
	{
		const { companyId, userId, reId } = await books();
		const { txnIds } = await makeUpload(companyId, userId, [{ date: '2026-08-15', description: 'Y', debit: '1000' }], { status: 'done' });
		await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, '5-2010') }).where(eq(transactions.id, txnIds[0]));
		expect(await code(closeFiscalYear(companyId, userId, { periodStart: start, retainedEarningsAccountId: reId }, TODAY))).toMatchObject({ code: 'journal_not_generated' });
	}
	await resetDb();
	// (c)
	{
		const { companyId, userId, reId } = await books();
		expect(await code(closeFiscalYear(companyId, userId, { periodStart: start, retainedEarningsAccountId: reId }, '2026-12-31'))).toMatchObject({ code: 'year_not_ended' });
	}
	await resetDb();
	// (d)
	{
		const { companyId, userId, reId } = await books({ with2025: true });
		expect(await code(closeFiscalYear(companyId, userId, { periodStart: start, retainedEarningsAccountId: reId }, TODAY))).toMatchObject({ code: 'previous_year_open' });
	}
	await resetDb();
	// (e), (f)
	{
		const { companyId, userId } = await books();
		const bad = await accountIdByCode(companyId, '1-1001');
		expect(await code(closeFiscalYear(companyId, userId, { periodStart: start, retainedEarningsAccountId: bad }, TODAY))).toEqual({
			code: 'invalid_retained_earnings',
			field: 'retainedEarningsAccountId'
		});
		const re = await accountIdByCode(companyId, '3-1003');
		expect(await code(closeFiscalYear(companyId, userId, { periodStart: '2026-02-01', retainedEarningsAccountId: re }, TODAY))).toMatchObject({ code: 'invalid_period', field: 'periodStart' });
	}
});

test('only the latest closed year can be reopened; close-reopen-close is clean', async () => {
	const { companyId, userId, reId } = await books({ with2025: true });
	const close = (s: string) => closeFiscalYear(companyId, userId, { periodStart: s, retainedEarningsAccountId: reId }, TODAY);
	await close('2025-01-01');
	await close('2026-01-01');
	expect(await code(reopenFiscalYear(companyId, '2025-01-01'))).toMatchObject({ code: 'not_latest_closing' });
	await reopenFiscalYear(companyId, '2026-01-01');
	await close('2026-01-01');
	const js = await db.select().from(journalEntries).where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.refNo, 'TUTUP-2026')));
	expect(js).toHaveLength(1);
	const cs = await db.select().from(fiscalClosings).where(and(eq(fiscalClosings.companyId, companyId), eq(fiscalClosings.periodStart, '2026-01-01')));
	expect(cs).toHaveLength(1);
});

test('double close is serialized', async () => {
	const { companyId, userId, reId } = await books();
	const run = () => closeFiscalYear(companyId, userId, { periodStart: '2026-01-01', retainedEarningsAccountId: reId }, TODAY);
	const res = await Promise.allSettled([run(), run()]);
	expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	const rej = res.find((r) => r.status === 'rejected') as PromiseRejectedResult;
	expect(rej.reason.code).toBe('already_closed');
	const js = await db.select().from(journalEntries).where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.type, 'CLOSING')));
	expect(js).toHaveLength(1);
});

test('listFiscalYears reports status and permissions', async () => {
	const { companyId, userId, reId } = await books({ with2025: true });
	let ys = await listFiscalYears(companyId, TODAY);
	expect(ys.map((y) => y.label)).toEqual(['2025', '2026', '2027']);
	expect(ys.map((y) => y.canClose)).toEqual([true, false, false]);
	expect(ys[1].netProfit).toBe('3150000.00');
	await closeFiscalYear(companyId, userId, { periodStart: '2025-01-01', retainedEarningsAccountId: reId }, TODAY);
	ys = await listFiscalYears(companyId, TODAY);
	expect(ys[0]).toMatchObject({ status: 'closed', canReopen: true, canClose: false });
	expect(ys[0].closedByName).toBeTruthy();
	expect(ys[1]).toMatchObject({ canClose: true, canReopen: false });
	expect(ys[2]).toMatchObject({ ended: false, canClose: false });
	expect(ys[1].netProfit).toBe('3150000.00');
});

test('unconfirmed or unjournaled transactions of EARLIER years block closing a later year', async () => {
	const start = '2026-01-01';
	{
		const { companyId, userId, reId } = await books();
		await makeUpload(companyId, userId, [{ date: '2025-06-15', description: 'Lama', debit: '1000' }]);
		const err = await closeFiscalYear(companyId, userId, { periodStart: start, retainedEarningsAccountId: reId }, TODAY).then(() => null, (e) => e);
		expect(err.code).toBe('pending_transactions');
		expect(err.message).toBe('Masih ada 1 transaksi yang belum dikonfirmasi sampai akhir tahun buku 2026');
	}
	await resetDb();
	{
		const { companyId, userId, reId } = await books();
		const { txnIds } = await makeUpload(companyId, userId, [{ date: '2025-06-15', description: 'Lama2', debit: '1000' }], { status: 'done' });
		await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, '5-2010') }).where(eq(transactions.id, txnIds[0]));
		expect(await code(closeFiscalYear(companyId, userId, { periodStart: start, retainedEarningsAccountId: reId }, TODAY))).toMatchObject({ code: 'journal_not_generated' });
	}
});
