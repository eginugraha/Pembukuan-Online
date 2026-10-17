import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { journalEntries, journalLines } from '../../src/lib/server/db/schema';
import { getOpening, saveOpening } from '../../src/lib/server/journal/opening';
import { balanceAtStartOf } from '../../src/lib/server/ledger/balance';
import { closeFiscalYear } from '../../src/lib/server/closing/close';
import { load } from '../../src/routes/(app)/settings/opening-balance/+page.server';
import { GET, PUT } from '../../src/routes/api/opening-balance/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId, bankAccountId } = await makeCompany();
	const modal = await accountIdByCode(companyId, '3-1001');
	const u = await makeUser();
	return { companyId, bankAccountId, modal, u };
}

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('save, read back and replace the single OPENING entry', async () => {
	const { companyId, bankAccountId, modal, u } = await setup();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '1000000', credit: '0' },
			{ accountId: modal, debit: '0', credit: '1000000' },
			{ accountId: await accountIdByCode(companyId, '1-1001'), debit: '0', credit: '0' }
		]
	});
	const opening = await getOpening(companyId);
	expect(opening?.date).toBe('2026-08-01');
	expect(opening?.lines).toHaveLength(2); // baris nol dibuang

	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '2000000', credit: '0' },
			{ accountId: modal, debit: '0', credit: '2000000' }
		]
	});
	const entries = await db.select().from(journalEntries).where(eq(journalEntries.type, 'OPENING'));
	expect(entries).toHaveLength(1);
	expect(await db.select().from(journalLines)).toHaveLength(2);
	expect(await balanceAtStartOf(db, companyId, bankAccountId, '2026-08-01')).toBe('2000000.00');
	expect(await balanceAtStartOf(db, companyId, modal, '2026-08-01')).toBe('2000000.00');
});

test('rejects unbalanced, empty, non-leaf and foreign accounts', async () => {
	const { companyId, bankAccountId, modal, u } = await setup();
	const other = await makeCompany('PT Lain');
	const parent = await accountIdByCode(companyId, '1-1000');
	const base = { date: '2026-08-01' };
	expect(await codeOf(saveOpening(companyId, u.id, { ...base, lines: [{ accountId: bankAccountId, debit: '10', credit: '0' }, { accountId: modal, debit: '0', credit: '9' }] }))).toBe('unbalanced');
	expect(await codeOf(saveOpening(companyId, u.id, { ...base, lines: [] }))).toBe('empty_opening');
	expect(await codeOf(saveOpening(companyId, u.id, { ...base, lines: [{ accountId: parent, debit: '10', credit: '0' }, { accountId: modal, debit: '0', credit: '10' }] }))).toBe('invalid_account');
	expect(await codeOf(saveOpening(companyId, u.id, { ...base, lines: [{ accountId: other.bankAccountId, debit: '10', credit: '0' }, { accountId: modal, debit: '0', credit: '10' }] }))).toBe('invalid_account');
	expect(await getOpening(companyId)).toBeNull();
});

test('API: viewer can read, only accountant+ can write', async () => {
	const { companyId, bankAccountId, modal } = await setup();
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const accountant = await makeUser();
	await addMember(accountant.id, companyId, 'accountant');
	const body = { date: '2026-08-01', lines: [{ accountId: bankAccountId, debit: '5', credit: '0' }, { accountId: modal, debit: '0', credit: '5' }] };

	expect((await call(GET, fakeEvent({ ctx: await contextFor(viewer) }))).status).toBe(200);
	expect((await call(PUT, fakeEvent({ ctx: await contextFor(viewer), method: 'PUT', body }))).status).toBe(403);
	expect((await call(PUT, fakeEvent({ ctx: await contextFor(accountant), method: 'PUT', body }))).status).toBe(200);
	expect((await call(PUT, fakeEvent({ ctx: await contextFor(accountant), method: 'PUT', body: { date: 'x', lines: [] } }))).status).toBe(400);
});

test('opening-balance page load reports the locked label only once a year is closed', async () => {
	const { companyId, bankAccountId, modal, u } = await setup();
	await addMember(u.id, companyId, 'accountant');
	const ctx = await contextFor(u, companyId);
	const run = async () => (await load(fakeEvent({ ctx, path: '/settings/opening-balance' }) as never)) as unknown as { lockedLabel: string | null };
	expect((await run()).lockedLabel).toBeNull();
	await saveOpening(companyId, u.id, {
		date: '2025-01-01',
		lines: [
			{ accountId: bankAccountId, debit: '100', credit: '0' },
			{ accountId: modal, debit: '0', credit: '100' }
		]
	});
	await closeFiscalYear(companyId, u.id, { periodStart: '2025-01-01', retainedEarningsAccountId: await accountIdByCode(companyId, '3-1003') }, '2026-06-01');
	expect((await run()).lockedLabel).toBe('2025');
});
