import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { DELETE } from '../../src/routes/api/companies/[id]/+server';
import { db } from '../../src/lib/server/db';
import {
	accounts,
	categoryRules,
	companies,
	companyLogos,
	contacts,
	invoices,
	journalEntries,
	journalLines,
	statementUploads,
	transactions,
	userCompanies
} from '../../src/lib/server/db/schema';
import { createContact } from '../../src/lib/server/invoicing/contacts';
import { createInvoice } from '../../src/lib/server/invoicing/invoices';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUpload, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function populate(name: string, userId: string) {
	const c = await makeCompany(name);
	await makeUpload(c.companyId, userId, [{ description: 'Setoran', credit: '1000' }]);
	const [je] = await db
		.insert(journalEntries)
		.values({ companyId: c.companyId, type: 'TRANSACTION', entryDate: '2026-08-02', description: 'Uji' })
		.returning({ id: journalEntries.id });
	await db.insert(journalLines).values([
		{ journalId: je.id, accountId: c.bankAccountId, debit: '1000' },
		{ journalId: je.id, accountId: await accountIdByCode(c.companyId, '3-1001'), credit: '1000' }
	]);
	const { id: contactId } = await createContact(c.companyId, { kind: 'CUSTOMER', name: 'PT Pelanggan' });
	await createInvoice(c.companyId, userId, { contactId, issueDate: '2026-10-01', lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000' }] });
	await db.insert(companyLogos).values({ companyId: c.companyId, content: Buffer.from('x'), mime: 'image/png' });
	await addMember(userId, c.companyId, 'admin');
	return c;
}

async function counts(companyId: string) {
	const n = async (t: any, col: any) => (await db.select().from(t).where(eq(col, companyId))).length;
	return [
		await n(companies, companies.id),
		await n(accounts, accounts.companyId),
		await n(categoryRules, categoryRules.companyId),
		await n(statementUploads, statementUploads.companyId),
		await n(journalEntries, journalEntries.companyId),
		await n(contacts, contacts.companyId),
		await n(invoices, invoices.companyId),
		await n(companyLogos, companyLogos.companyId),
		await n(userCompanies, userCompanies.companyId),
		(await db.select().from(transactions)).length
	];
}

const del = (ctx: Awaited<ReturnType<typeof contextFor>> | null, id: string, confirmName: string) =>
	call(DELETE, fakeEvent({ ctx, method: 'DELETE', params: { id }, body: { confirmName } }));

test('super admin deletes a company and everything in it', async () => {
	const admin = await makeUser({ isSuperAdmin: true });
	const a = await populate('PT A', admin.id);
	const b = await populate('PT B', admin.id);
	const bBefore = await counts(b.companyId);
	const txnsAll = bBefore[9];

	const res = await del(await contextFor(admin), a.companyId, 'PT A');
	expect(res.status).toBe(200);
	expect(res.body).toEqual({ ok: true });

	const after = await counts(a.companyId);
	expect(after.slice(0, 9)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
	expect(after[9]).toBe(txnsAll / 2);
	expect(await counts(b.companyId)).toEqual([...bBefore.slice(0, 9), txnsAll / 2]);
	expect(bBefore.slice(0, 9).every((x) => x > 0)).toBe(true);
});

test('wrong confirmation name is 422 and deletes nothing', async () => {
	const admin = await makeUser({ isSuperAdmin: true });
	const a = await populate('PT A', admin.id);
	const ctx = await contextFor(admin);
	const res = await del(ctx, a.companyId, 'pt a ');
	expect(res.status).toBe(422);
	expect(res.body.error.code).toBe('confirm_mismatch');
	expect(res.body.error.fields.confirmName).toBeTruthy();
	expect((await counts(a.companyId))[0]).toBe(1);
	expect((await del(ctx, a.companyId, '  PT A  ')).status).toBe(200);
});

test('non super admin gets 403; anonymous gets 401; unknown id gets 404', async () => {
	const admin = await makeUser({ isSuperAdmin: true });
	const a = await makeCompany('PT A');
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'admin');
	expect((await del(await contextFor(u), a.companyId, 'PT A')).status).toBe(403);
	expect((await del(null, a.companyId, 'PT A')).status).toBe(401);
	expect((await del(await contextFor(admin), crypto.randomUUID(), 'PT A')).status).toBe(404);
	expect((await counts(a.companyId))[0]).toBe(1);
});

test("a member's context falls back to another company after deletion", async () => {
	const admin = await makeUser({ isSuperAdmin: true });
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const both = await makeUser();
	const onlyA = await makeUser();
	await addMember(both.id, a.companyId, 'viewer');
	await addMember(both.id, b.companyId, 'viewer');
	await addMember(onlyA.id, a.companyId, 'viewer');
	expect((await del(await contextFor(admin), a.companyId, 'PT A')).status).toBe(200);
	expect((await contextFor(both, a.companyId)).companyId).toBe(b.companyId);
	expect((await contextFor(onlyA, a.companyId)).companyId).toBeNull();
});
