import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { companies, statementUploads, transactions } from '../../src/lib/server/db/schema';
import { getNextStep } from '../../src/lib/server/dashboard/next-step';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { getDashboard } from '../../src/lib/server/reports/dashboard';
import { accountIdByCode, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function withOpening(companyId: string, bankAccountId: string, userId: string) {
	await saveOpening(companyId, userId, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '1000000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '1000000' }
		]
	});
}

async function booksWithActivity() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await withOpening(companyId, bankAccountId, u.id);
	const { uploadId } = await makeUpload(companyId, u.id, [
		{ date: '2026-08-02', description: 'BIAYA ADM', debit: '30000' },
		{ date: '2026-08-05', description: 'TRSF MASUK', credit: '2500000' }
	]);
	await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, '5-2010') }).where(eq(transactions.description, 'BIAYA ADM'));
	await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, '4-1001') }).where(eq(transactions.description, 'TRSF MASUK'));
	await generateJournal(companyId, uploadId, u.id);
	return { companyId, bankAccountId, u, uploadId };
}

test('full books: bank balance, 6-month flows, profit and recent transactions', async () => {
	const { companyId, uploadId } = await booksWithActivity();
	const d = await getDashboard(companyId, 'admin', '2026-08-20');
	expect(d.bank?.balance).toBe('3470000.00');
	expect(d.bank?.name).toBe('Bank BCA');
	expect(d.pendingCount).toBe(0);
	expect(d.monthly.map((m) => m.month)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
	expect(d.monthly[5]).toEqual({ month: '2026-08', income: '2500000.00', expense: '30000.00' });
	expect(d.monthly[4]).toEqual({ month: '2026-07', income: '0.00', expense: '0.00' });
	expect(d.profitThisYear).toBe('2470000.00');
	expect(d.balanced).toBe(true);
	expect(d.recentTransactions.map((t) => [t.amount, t.accountName])).toEqual([
		['2500000.00', 'Pendapatan Jasa'],
		['-30000.00', 'Beban Administrasi Bank']
	]);
	expect(d.latestUpload).toMatchObject({ id: uploadId, accountNo: '1234567890', periodStart: '2026-08-01', periodEnd: '2026-08-31' });
	expect(d.actions).toEqual([]);
});

test('empty company: no data, only the opening-balance action', async () => {
	const { companyId } = await makeCompany();
	const d = await getDashboard(companyId, 'admin', '2026-08-20');
	expect(d.latestUpload).toBeNull();
	expect(d.recentTransactions).toEqual([]);
	expect(d.monthly).toHaveLength(6);
	expect(d.monthly.every((m) => m.income === '0.00' && m.expense === '0.00')).toBe(true);
	expect(d.profitThisYear).toBe('0.00');
	expect(d.bank?.balance).toBe('0.00');
	expect(d.actions.map((a) => [a.kind, a.href])).toEqual([['opening', '/settings/opening-balance']]);
});

test('bank account not set gives bank = null', async () => {
	const { companyId } = await makeCompany();
	await db.update(companies).set({ bankAccountId: null }).where(eq(companies.id, companyId));
	expect((await getDashboard(companyId, 'admin', '2026-08-20')).bank).toBeNull();
});

test('actions reflect upload state', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await withOpening(companyId, bankAccountId, u.id);
	const review = await makeUpload(companyId, u.id, [{ description: 'APA INI', debit: '1' }], { accountNo: 'A', status: 'review' });
	const ready = await makeUpload(companyId, u.id, [{ description: 'BIAYA ADM', debit: '1' }], { accountNo: 'B', status: 'done' });
	await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, '5-2010') }).where(eq(transactions.uploadId, ready.uploadId));
	const broken = await makeUpload(companyId, u.id, [], { accountNo: 'C', status: 'error' });
	const warned = await makeUpload(companyId, u.id, [], { accountNo: 'D', status: 'done' });
	await db.update(statementUploads).set({ balanceWarning: 'Saldo awal berbeda' }).where(eq(statementUploads.id, warned.uploadId));

	const byKind = Object.fromEntries((await getDashboard(companyId, 'admin', '2026-08-20')).actions.map((a) => [a.kind, a.href]));
	expect(byKind).toEqual({
		review: `/uploads/${review.uploadId}`,
		journal: `/uploads/${ready.uploadId}`,
		error: `/uploads/${broken.uploadId}`,
		balance_warning: `/uploads/${warned.uploadId}`
	});
});

test('viewer gets no write actions and no next step', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await makeUpload(companyId, u.id, [{ description: 'APA INI', debit: '1' }], { status: 'review' });
	const kinds = (await getDashboard(companyId, 'viewer', '2026-08-20')).actions.map((a) => a.kind);
	expect(kinds).not.toContain('review');
	expect(kinds).not.toContain('journal');
	expect(kinds).not.toContain('opening');
	expect(await getNextStep(companyId, 'viewer')).toBeNull();
});

test('next step: opening first, then review, then upload', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	expect((await getNextStep(companyId, 'accountant'))?.href).toBe('/settings/opening-balance');
	await withOpening(companyId, bankAccountId, u.id);
	expect((await getNextStep(companyId, 'accountant'))?.href).toBe('/uploads/new');
	await makeUpload(companyId, u.id, [{ description: 'APA INI', debit: '1' }], { status: 'review' });
	const step = await getNextStep(companyId, 'accountant');
	expect(step?.href).toBe('/review');
	expect(step?.label).toContain('1');
});

test('works when the current month has 30 days', async () => {
	const { companyId } = await makeCompany();
	const d = await getDashboard(companyId, 'admin', '2026-06-15');
	expect(d.monthly.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
});
