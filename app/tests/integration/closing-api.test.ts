import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { GET, POST } from '../../src/routes/api/closings/+server';
import { DELETE } from '../../src/routes/api/closings/[periodStart]/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUpload, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup(opts: { pending?: boolean } = {}) {
	const { companyId, bankAccountId } = await makeCompany();
	const admin = await makeUser();
	await addMember(admin.id, companyId, 'admin');
	await saveOpening(companyId, admin.id, {
		date: '2023-01-01',
		lines: [
			{ accountId: bankAccountId, debit: '1000000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '1000000' }
		]
	});
	for (const y of ['2023', '2024']) {
		const { uploadId, txnIds } = await makeUpload(companyId, admin.id, [{ date: `${y}-03-01`, description: `JUAL${y}`, credit: '500000' }], { status: 'done' });
		await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, '4-1001') }).where(eq(transactions.id, txnIds[0]));
		await generateJournal(companyId, uploadId, admin.id);
	}
	if (opts.pending) {
		await makeUpload(companyId, admin.id, [{ date: '2024-04-01', description: 'PENDING', credit: '1000' }], { status: 'done' });
	}
	return { companyId, admin, ctx: await contextFor(admin, companyId), reId: await accountIdByCode(companyId, '3-1003') };
}

test('GET: 401 without session, 403 for accountant, 200 for admin', async () => {
	const { companyId, ctx } = await setup();
	expect((await call(GET, fakeEvent({ ctx: null }))).status).toBe(401);
	const acc = await makeUser();
	await addMember(acc.id, companyId, 'accountant');
	expect((await call(GET, fakeEvent({ ctx: await contextFor(acc, companyId) }))).status).toBe(403);
	const res = await call(GET, fakeEvent({ ctx }));
	expect(res.status).toBe(200);
	expect(res.body.map((r: { periodStart: string }) => r.periodStart)).toEqual(expect.arrayContaining(['2023-01-01', '2024-01-01']));
});

test('POST closes a year (201) and GET shows closed; DELETE of non-latest is 409, latest is 200', async () => {
	const { ctx, reId } = await setup();
	const post = (periodStart: string) => call(POST, fakeEvent({ ctx, method: 'POST', body: { periodStart, retainedEarningsAccountId: reId } }));
	const r1 = await post('2023-01-01');
	expect(r1.status).toBe(201);
	expect(r1.body.journalId).toBeString();
	expect((await post('2024-01-01')).status).toBe(201);
	const list = await call(GET, fakeEvent({ ctx }));
	expect(list.body.find((r: { periodStart: string }) => r.periodStart === '2023-01-01').status).toBe('closed');

	const notLatest = await call(DELETE, fakeEvent({ ctx, method: 'DELETE', params: { periodStart: '2023-01-01' } }));
	expect(notLatest.status).toBe(409);
	expect(notLatest.body.error.code).toBe('not_latest_closing');
	expect((await call(DELETE, fakeEvent({ ctx, method: 'DELETE', params: { periodStart: '2024-01-01' } }))).status).toBe(200);
	const after = await call(GET, fakeEvent({ ctx }));
	expect(after.body.find((r: { periodStart: string }) => r.periodStart === '2024-01-01').status).toBe('open');
});

test('POST with pending transactions is 409 with an Indonesian message', async () => {
	const { ctx, reId } = await setup({ pending: true });
	const first = await call(POST, fakeEvent({ ctx, method: 'POST', body: { periodStart: '2023-01-01', retainedEarningsAccountId: reId } }));
	expect(first.status).toBe(201);
	const res = await call(POST, fakeEvent({ ctx, method: 'POST', body: { periodStart: '2024-01-01', retainedEarningsAccountId: reId } }));
	expect(res.status).toBe(409);
	expect(res.body.error.code).toBe('pending_transactions');
	expect(res.body.error.message).toMatch(/[Tt]ransaksi/);
});

test('DELETE rejects a malformed periodStart with 400; accountant is 403', async () => {
	const { companyId, ctx } = await setup();
	expect((await call(DELETE, fakeEvent({ ctx, method: 'DELETE', params: { periodStart: 'abc' } }))).status).toBe(400);
	const acc = await makeUser();
	await addMember(acc.id, companyId, 'accountant');
	expect((await call(DELETE, fakeEvent({ ctx: await contextFor(acc, companyId), method: 'DELETE', params: { periodStart: '2024-01-01' } }))).status).toBe(403);
});

test('POST: 401 without session, 403 for accountant, 422 field error for a non-equity account', async () => {
	const { companyId, ctx } = await setup();
	const body = { periodStart: '2023-01-01', retainedEarningsAccountId: await accountIdByCode(companyId, '1-1001') };
	expect((await call(POST, fakeEvent({ ctx: null, method: 'POST', body }))).status).toBe(401);
	const acc = await makeUser();
	await addMember(acc.id, companyId, 'accountant');
	expect((await call(POST, fakeEvent({ ctx: await contextFor(acc, companyId), method: 'POST', body }))).status).toBe(403);
	const res = await call(POST, fakeEvent({ ctx, method: 'POST', body }));
	expect(res.status).toBe(422);
	expect(res.body.error.code).toBe('invalid_retained_earnings');
	expect(res.body.error.fields.retainedEarningsAccountId).toBeString();
});
