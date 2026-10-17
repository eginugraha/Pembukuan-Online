import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { journalEntries, transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { load } from '../../src/routes/(app)/journal/+page.server';
import { PATCH } from '../../src/routes/api/journal/[id]/account/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUpload, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const beban = await accountIdByCode(companyId, '5-2010');
	const { uploadId, txnIds } = await makeUpload(companyId, u.id, [{ date: '2026-08-02', description: 'BIAYA ADM', debit: '30000' }]);
	await db.update(transactions).set({ isConfirmed: true, accountId: beban }).where(eq(transactions.id, txnIds[0]));
	await generateJournal(companyId, uploadId, u.id);
	return { companyId, bankAccountId, u };
}

const pageLoad = async (ctx: Awaited<ReturnType<typeof contextFor>>) => {
	const event = { ...fakeEvent({ ctx, path: '/journal?from=2026-08-01&to=2026-08-31' }) };
	return (await load(event as never)) as unknown as { canEdit: boolean; accounts: unknown[] };
};

test('only accountants and above get the edit capability and the account list; viewers get neither', async () => {
	const { companyId } = await setup();
	const viewer = await makeUser();
	const accountant = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	await addMember(accountant.id, companyId, 'accountant');
	const v = await pageLoad(await contextFor(viewer, companyId));
	expect([v.canEdit, v.accounts]).toEqual([false, []]);
	const a = await pageLoad(await contextFor(accountant, companyId));
	expect(a.canEdit).toBe(true);
	expect(a.accounts.length).toBeGreaterThan(10);
});

test('errors that are not about the chosen account carry no field (shown as a general message)', async () => {
	const { companyId, bankAccountId, u } = await setup();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '100', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '100' }
		]
	});
	const [opening] = await db.select().from(journalEntries).where(eq(journalEntries.type, 'OPENING'));
	await addMember(u.id, companyId, 'accountant');
	const ctx = await contextFor(u, companyId);
	const res = await call(PATCH, fakeEvent({ ctx, method: 'PATCH', params: { id: opening.id }, body: { accountId: await accountIdByCode(companyId, '5-2001') } }));
	expect(res.status).toBe(409);
	expect(res.body.error.code).toBe('journal_not_editable');
	expect(res.body.error.fields).toBeUndefined();

	// Sedangkan akun yang salah dipilih tetap menunjuk field-nya.
	const [txnEntry] = await db.select().from(journalEntries).where(eq(journalEntries.type, 'TRANSACTION'));
	const bad = await call(PATCH, fakeEvent({ ctx, method: 'PATCH', params: { id: txnEntry.id }, body: { accountId: bankAccountId } }));
	expect(bad.status).toBe(422);
	expect(Object.keys(bad.body.error.fields)).toEqual(['accountId']);
});
