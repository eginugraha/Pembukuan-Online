import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { getTrialBalance } from '../../src/lib/server/reports/trial-balance';
import { GET } from '../../src/routes/api/reports/trial-balance/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUpload, makeUser } from './factory';
import { call, fakeEvent } from './event';
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
	return { companyId };
}

test('opening journal dated on from goes to opening, not movement', async () => {
	const { companyId } = await booksWithActivity();
	const tb = await getTrialBalance(companyId, { from: '2026-08-01', to: '2026-08-31' });
	const by = Object.fromEntries(tb.rows.map((r) => [r.code, r]));
	expect(by['1-1002']).toMatchObject({
		openingDebit: '1000000.00',
		debit: '2500000.00',
		credit: '30000.00',
		closingDebit: '3470000.00'
	});
	expect(by['3-1001']).toMatchObject({ openingCredit: '1000000.00', debit: '0.00', credit: '0.00' });
	expect(tb.totals.debit).toBe('2530000.00');
	expect(tb.totals.credit).toBe('2530000.00');
	expect(tb.balanced).toBe(true);
});

test('earlier movements roll into opening balance', async () => {
	const { companyId } = await booksWithActivity();
	const tb = await getTrialBalance(companyId, { from: '2026-08-03', to: '2026-08-31' });
	const by = Object.fromEntries(tb.rows.map((r) => [r.code, r]));
	expect(by['5-2010']).toMatchObject({ openingDebit: '30000.00', debit: '0.00', credit: '0.00', closingDebit: '30000.00' });
	expect(by['4-1001']).toMatchObject({ credit: '2500000.00' });
});

test('accounts with nothing in any column are hidden', async () => {
	const { companyId } = await booksWithActivity();
	// range covering only the OPENING date: expense/revenue accounts have nothing yet
	const tb = await getTrialBalance(companyId, { from: '2026-08-01', to: '2026-08-01' });
	expect(tb.rows.map((r) => r.code)).toEqual(['1-1002', '3-1001']);
	const none = await getTrialBalance(companyId, { from: '2026-07-01', to: '2026-07-31' });
	expect(none.rows).toHaveLength(0);
});

async function viewerCtx(companyId: string) {
	const v = await makeUser();
	await addMember(v.id, companyId, 'viewer');
	return contextFor(v, companyId);
}

test('API returns the range result', async () => {
	const { companyId } = await booksWithActivity();
	const ctx = await viewerCtx(companyId);
	const res = await call(GET, fakeEvent({ ctx, path: '/api/reports/trial-balance?from=2026-08-01&to=2026-08-31' }));
	expect(res.status).toBe(200);
	expect(res.body.totals.debit).toBe('2530000.00');
});

test('API rejects from after to', async () => {
	const { companyId } = await booksWithActivity();
	const ctx = await viewerCtx(companyId);
	const res = await call(GET, fakeEvent({ ctx, path: '/api/reports/trial-balance?from=2026-09-01&to=2026-08-01' }));
	expect(res.status).toBe(400);
	expect(res.body.error.code).toBe('invalid_range');
});

test('API keeps as_of compatibility', async () => {
	const { companyId } = await booksWithActivity();
	const ctx = await viewerCtx(companyId);
	const res = await call(GET, fakeEvent({ ctx, path: '/api/reports/trial-balance?as_of=2026-08-31' }));
	expect(res.status).toBe(200);
	expect(res.body.from).toBe('2026-01-01');
});
