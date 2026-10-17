import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { companies, transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { getBalanceSheet, getBalanceSheetComparative, type BalanceSheetLine } from '../../src/lib/server/reports/balance-sheet';
import { GET } from '../../src/routes/api/reports/balance-sheet/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUpload, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const flat = (lines: BalanceSheetLine[]): Record<string, string> =>
	Object.fromEntries(lines.flatMap((l) => [[l.name, l.amount], ...Object.entries(flat(l.children))]));

async function booksWithActivity(txnDates = ['2026-08-02', '2026-08-05']) {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '1000000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '1000000' }
		]
	});
	const { uploadId } = await makeUpload(companyId, u.id, [
		{ date: txnDates[0], description: 'BIAYA ADM', debit: '30000' },
		{ date: txnDates[1], description: 'TRSF MASUK', credit: '2500000' }
	]);
	await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, '5-2010') }).where(eq(transactions.description, 'BIAYA ADM'));
	await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, '4-1001') }).where(eq(transactions.description, 'TRSF MASUK'));
	await generateJournal(companyId, uploadId, u.id);
	return { companyId, u };
}

test('balances with current-year profit computed into equity', async () => {
	const { companyId } = await booksWithActivity();
	const bs = await getBalanceSheet(companyId, '2026-08-31');
	expect(bs.fiscalYearStart).toBe('2026-01-01');
	expect(flat(bs.assets.current.lines)).toEqual({ 'Bank BCA': '3470000.00' });
	expect(bs.assets.current.total).toBe('3470000.00');
	expect(bs.assets.nonCurrent.lines).toEqual([]);
	expect(bs.assets.total).toBe('3470000.00');
	expect(bs.liabilities.total).toBe('0.00');
	expect(flat(bs.equity.lines)).toEqual({ 'Modal Saham Disetor': '1000000.00', 'Laba (Rugi) Tahun Berjalan': '2470000.00' });
	expect(bs.equity.total).toBe('3470000.00');
	expect(bs.totalLiabilitiesAndEquity).toBe('3470000.00');
	expect(bs.balanced).toBe(true);
});

test('profit of previous fiscal years moves to prior-years line', async () => {
	const { companyId } = await booksWithActivity();
	const bs = await getBalanceSheet(companyId, '2027-01-31');
	expect(flat(bs.equity.lines)).toEqual({ 'Modal Saham Disetor': '1000000.00', 'Laba (Rugi) Tahun-tahun Lalu': '2470000.00' });
	expect(bs.balanced).toBe(true);
});

test('fiscal year start month splits current vs prior profit', async () => {
	const { companyId } = await booksWithActivity(['2026-08-02', '2026-08-05']);
	await db.update(companies).set({ fiscalYear: 'AUGUST' }).where(eq(companies.id, companyId));
	const bs = await getBalanceSheet(companyId, '2026-08-31');
	expect(bs.fiscalYearStart).toBe('2026-08-01');
	expect(flat(bs.equity.lines)['Laba (Rugi) Tahun Berjalan']).toBe('2470000.00');
	const next = await getBalanceSheet(companyId, '2027-08-01');
	expect(flat(next.equity.lines)['Laba (Rugi) Tahun-tahun Lalu']).toBe('2470000.00');
});

test('classifies current vs non-current, nets accumulated depreciation, nests groups', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const id = (code: string) => accountIdByCode(companyId, code);
	await saveOpening(companyId, u.id, {
		date: '2026-01-01',
		lines: [
			{ accountId: bankAccountId, debit: '10000000', credit: '0' },
			{ accountId: await id('1-2103'), debit: '50000000', credit: '0' },
			{ accountId: await id('1-2202'), debit: '0', credit: '10000000' },
			{ accountId: await id('1-3002'), debit: '4000000', credit: '0' },
			{ accountId: await id('2-1001'), debit: '0', credit: '5000000' },
			{ accountId: await id('2-2001'), debit: '0', credit: '20000000' },
			{ accountId: await id('3-1001'), debit: '0', credit: '29000000' }
		]
	});
	const bs = await getBalanceSheet(companyId, '2026-12-31');
	expect(bs.assets.current.total).toBe('10000000.00');
	const nc = bs.assets.nonCurrent;
	expect(nc.lines.map((l) => [l.name, l.amount])).toEqual([
		['Aset Tetap', '50000000.00'],
		['Akumulasi Penyusutan', '-10000000.00'],
		['Aset Tak Berwujud', '4000000.00']
	]);
	expect(nc.lines[0].children.map((l) => [l.code, l.amount])).toEqual([['1-2103', '50000000.00']]);
	expect(nc.total).toBe('44000000.00');
	expect(bs.assets.total).toBe('54000000.00');
	expect(bs.liabilities.current.total).toBe('5000000.00');
	expect(bs.liabilities.nonCurrent.total).toBe('20000000.00');
	expect(bs.liabilities.total).toBe('25000000.00');
	expect(bs.equity.total).toBe('29000000.00');
	expect(bs.balanced).toBe(true);
});

test('empty books are balanced with no lines', async () => {
	const { companyId } = await makeCompany();
	const bs = await getBalanceSheet(companyId, '2026-08-31');
	expect(bs.assets.total).toBe('0.00');
	expect(bs.equity.lines).toEqual([]);
	expect(bs.balanced).toBe(true);
});

test('API: viewer can read, anonymous is 401', async () => {
	const { companyId } = await booksWithActivity();
	const v = await makeUser();
	await addMember(v.id, companyId, 'viewer');
	const res = await call(GET, fakeEvent({ ctx: await contextFor(v), path: '/api/reports/balance-sheet?as_of=2026-08-31' }));
	expect(res.status).toBe(200);
	expect(res.body.current.balanced).toBe(true);
	expect(res.body.current.asOf).toBe('2026-08-31');
	expect((await call(GET, fakeEvent({ ctx: null }))).status).toBe(401);
});

test('comparative column is the previous fiscal year end with identical row shape', async () => {
	const { companyId } = await booksWithActivity();
	const { current, comparative } = await getBalanceSheetComparative(companyId, '2026-12-31');
	expect(comparative.asOf).toBe('2025-12-31');
	expect(Object.keys(flat(comparative.equity.lines))).toEqual(Object.keys(flat(current.equity.lines)));
	expect(Object.keys(flat(comparative.assets.current.lines))).toEqual(Object.keys(flat(current.assets.current.lines)));
	expect(Object.values(flat(comparative.equity.lines)).every((v) => v === '0.00')).toBe(true);
	expect(Object.values(flat(comparative.assets.current.lines)).every((v) => v === '0.00')).toBe(true);
	expect(comparative.assets.total).toBe('0.00');
	expect(current.balanced).toBe(true);
	expect(comparative.balanced).toBe(true);
});

test('comparative follows a non-January fiscal year', async () => {
	const { companyId } = await booksWithActivity();
	await db.update(companies).set({ fiscalYear: 'JULY' }).where(eq(companies.id, companyId));
	const { comparative } = await getBalanceSheetComparative(companyId, '2026-08-31');
	expect(comparative.asOf).toBe('2026-06-30');
});

test('API returns current and comparative', async () => {
	const { companyId } = await booksWithActivity();
	const v = await makeUser();
	await addMember(v.id, companyId, 'viewer');
	const res = await call(GET, fakeEvent({ ctx: await contextFor(v), path: '/api/reports/balance-sheet?as_of=2026-12-31' }));
	expect(res.status).toBe(200);
	expect(res.body.current.asOf).toBe('2026-12-31');
	expect(res.body.comparative.asOf).toBe('2025-12-31');
});
