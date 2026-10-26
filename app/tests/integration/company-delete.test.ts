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
	fiscalClosings,
	journalLines,
	purchaseOrders,
	statementUploads,
	transactions,
	userCompanies
} from '../../src/lib/server/db/schema';
import { createContact } from '../../src/lib/server/invoicing/contacts';
import { createPurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { createInvoice } from '../../src/lib/server/invoicing/invoices';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUpload, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function populate(name: string, userId: string) {
	const c = await makeCompany(name);
	const { txnIds } = await makeUpload(c.companyId, userId, [{ description: 'Setoran', credit: '1000' }]);
	const modal = await accountIdByCode(c.companyId, '3-1001');
	// transactions.account_id dan ai_suggested_account_id menunjuk ke accounts tanpa ON DELETE
	await db.update(transactions).set({ accountId: modal, aiSuggestedAccountId: c.bankAccountId }).where(eq(transactions.id, txnIds[0]));
	const [je] = await db
		.insert(journalEntries)
		.values({ companyId: c.companyId, type: 'TRANSACTION', entryDate: '2026-08-02', description: 'Uji' })
		.returning({ id: journalEntries.id });
	await db.insert(journalLines).values([
		{ journalId: je.id, accountId: c.bankAccountId, debit: '1000' },
		{ journalId: je.id, accountId: await accountIdByCode(c.companyId, '3-1001'), credit: '1000' }
	]);
	const { id: contactId } = await createContact(c.companyId, { kind: 'CUSTOMER', name: 'PT Pelanggan', code: 'PLG' });
	await createInvoice(c.companyId, userId, { contactId, issueDate: '2026-10-01', lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000' }] });
	const { id: vendorId } = await createContact(c.companyId, { kind: 'VENDOR', name: 'PT Vendor', code: 'VND' });
	await createPurchaseOrder(c.companyId, userId, { contactId: vendorId, issueDate: '2026-10-01', lines: [{ description: 'Barang', quantity: '1', unitPrice: '500' }] });
	await db.insert(fiscalClosings).values({ companyId: c.companyId, periodStart: '2026-01-01', periodEnd: '2026-12-31', retainedEarningsAccountId: modal });
	await db.insert(companyLogos).values({ companyId: c.companyId, content: Buffer.from('x'), mime: 'image/png' });
	await addMember(userId, c.companyId, 'admin');
	return c;
}

async function counts(companyId: string) {
	const n = async (t: any, col: any) => (await db.select().from(t).where(eq(col, companyId))).length;
	return {
		companies: await n(companies, companies.id),
		accounts: await n(accounts, accounts.companyId),
		categoryRules: await n(categoryRules, categoryRules.companyId),
		statementUploads: await n(statementUploads, statementUploads.companyId),
		transactions: await n(transactions, transactions.companyId),
		journalEntries: await n(journalEntries, journalEntries.companyId),
		fiscalClosings: await n(fiscalClosings, fiscalClosings.companyId),
		contacts: await n(contacts, contacts.companyId),
		invoices: await n(invoices, invoices.companyId),
		purchaseOrders: await n(purchaseOrders, purchaseOrders.companyId),
		companyLogos: await n(companyLogos, companyLogos.companyId),
		userCompanies: await n(userCompanies, userCompanies.companyId)
	};
}

const del = (ctx: Awaited<ReturnType<typeof contextFor>> | null, id: string, confirmName: string) =>
	call(DELETE, fakeEvent({ ctx, method: 'DELETE', params: { id }, body: { confirmName } }));

test('super admin deletes a company and everything in it', async () => {
	const admin = await makeUser({ isSuperAdmin: true });
	const a = await populate('PT A', admin.id);
	const b = await populate('PT B', admin.id);
	const aBefore = await counts(a.companyId);
	const bBefore = await counts(b.companyId);
	expect(Object.values(aBefore).every((x) => x > 0)).toBe(true);
	expect(bBefore).toEqual(aBefore);

	const res = await del(await contextFor(admin), a.companyId, 'PT A');
	expect(res.status).toBe(200);
	expect(res.body).toEqual({ ok: true });

	expect(Object.values(await counts(a.companyId)).every((x) => x === 0)).toBe(true);
	expect(await counts(b.companyId)).toEqual(bBefore);
});

test('wrong confirmation name is 422 and deletes nothing', async () => {
	const admin = await makeUser({ isSuperAdmin: true });
	const a = await populate('PT A', admin.id);
	const ctx = await contextFor(admin);
	const res = await del(ctx, a.companyId, 'pt a ');
	expect(res.status).toBe(422);
	expect(res.body.error.code).toBe('confirm_mismatch');
	expect(res.body.error.fields.confirmName).toBeTruthy();
	expect((await counts(a.companyId)).companies).toBe(1);
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
	expect((await counts(a.companyId)).companies).toBe(1);
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
