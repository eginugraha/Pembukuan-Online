import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, contacts, fiscalClosings, invoices, journalEntries, purchaseOrders } from '../../src/lib/server/db/schema';
import { createInvoice, listInvoices } from '../../src/lib/server/invoicing/invoices';
import { createPurchaseOrder, issuePurchaseOrder, listPurchaseOrders, receivePurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { assertAccountOfType } from '../../src/lib/server/invoicing/accounts';
import { createContact, listContacts, updateContact } from '../../src/lib/server/invoicing/contacts';
import { CreateInvoiceInput } from '../../src/lib/schemas/invoice';
import { CreatePurchaseOrderInput } from '../../src/lib/schemas/purchase-order';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function contact(companyId: string, kind: 'CUSTOMER' | 'VENDOR' | 'BOTH', isActive = true) {
	const [row] = await db.insert(contacts).values({ companyId, kind, name: `PT ${kind}`, isActive }).returning();
	return row.id;
}

async function invoiceInput(_companyId: string, contactId: string, extra: Partial<CreateInvoiceInput> = {}): Promise<CreateInvoiceInput> {
	return {
		contactId,
		issueDate: '2026-10-01',
		lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000000' }],
		...extra
	};
}

async function poInput(companyId: string, contactId: string, extra: Partial<CreatePurchaseOrderInput> = {}): Promise<CreatePurchaseOrderInput> {
	return {
		contactId,
		issueDate: '2026-10-01',
		payableAccountId: await accountIdByCode(companyId, '2-1001'),
		lines: [{ description: 'Sewa', quantity: '1', unitPrice: '2000000', expenseAccountId: await accountIdByCode(companyId, '5-2010') }],
		...extra
	};
}

// ---- Finding 2: tax account must be ASSET or LIABILITY ----

test('assertAccountOfType accepts a list of allowed types', async () => {
	const { companyId } = await makeCompany();
	const tax = await accountIdByCode(companyId, '2-1005');
	const revenue = await accountIdByCode(companyId, '4-1001');
	expect((await assertAccountOfType(db, companyId, tax, ['ASSET', 'LIABILITY'])).id).toBe(tax);
	await expect(assertAccountOfType(db, companyId, revenue, ['ASSET', 'LIABILITY'])).rejects.toMatchObject({ code: 'wrong_account_type' });
});

test('a PO with an EXPENSE account as its tax account is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const c = await contact(companyId, 'VENDOR');
	const expense = await accountIdByCode(companyId, '5-2010');
	await expect(createPurchaseOrder(companyId, u.id, await poInput(companyId, c, { taxRate: '11', taxAccountId: expense }))).rejects.toMatchObject({ code: 'wrong_account_type' });
});

test('a LIABILITY tax account is still accepted on a PO', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const tax = await accountIdByCode(companyId, '2-1005');
	await createPurchaseOrder(companyId, u.id, await poInput(companyId, await contact(companyId, 'VENDOR'), { taxRate: '11', taxAccountId: tax }));
});

// ---- Finding 3: contact must belong to the company, have a compatible kind, and be active ----

test('invoicing a VENDOR-only contact is rejected with wrong_contact_kind', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await expect(createInvoice(companyId, u.id, await invoiceInput(companyId, await contact(companyId, 'VENDOR')))).rejects.toMatchObject({ code: 'wrong_contact_kind' });
});

test('a PO to a CUSTOMER-only contact is rejected with wrong_contact_kind', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await expect(createPurchaseOrder(companyId, u.id, await poInput(companyId, await contact(companyId, 'CUSTOMER')))).rejects.toMatchObject({ code: 'wrong_contact_kind' });
});

test('BOTH contacts are accepted on invoices and POs', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const both = await contact(companyId, 'BOTH');
	await createInvoice(companyId, u.id, await invoiceInput(companyId, both));
	await createPurchaseOrder(companyId, u.id, await poInput(companyId, both));
});

test('invoicing a deactivated contact is rejected with contact_inactive', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const c = await contact(companyId, 'CUSTOMER');
	await updateContact(companyId, c, { isActive: false });
	await expect(createInvoice(companyId, u.id, await invoiceInput(companyId, c))).rejects.toMatchObject({ code: 'contact_inactive' });
});

test("invoicing another company's contact is rejected as not found", async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const u = await makeUser();
	const foreign = await contact(b.companyId, 'CUSTOMER');
	await expect(createInvoice(a.companyId, u.id, await invoiceInput(a.companyId, foreign))).rejects.toMatchObject({ status: 404, code: 'not_found' });
	await expect(createPurchaseOrder(a.companyId, u.id, await poInput(a.companyId, await contact(b.companyId, 'VENDOR')))).rejects.toMatchObject({ status: 404 });
});

test("list views never join in another company's contact name, even for a pre-existing mismatched row", async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const [foreign] = await db.insert(contacts).values({ companyId: b.companyId, kind: 'BOTH', name: 'Rahasia PT B' }).returning();
	const payable = await accountIdByCode(a.companyId, '2-1001');
	// Bypass the service (simulate a row created before the creation-time check existed).
	await db.insert(invoices).values({ companyId: a.companyId, contactId: foreign.id, invoiceNo: 'INV-2026-0001', issueDate: '2026-10-01', subtotal: '0', taxAmount: '0', total: '0' });
	await db.insert(purchaseOrders).values({ companyId: a.companyId, contactId: foreign.id, issueDate: '2026-10-01', payableAccountId: payable, status: 'DRAFT', subtotal: '0', taxAmount: '0', total: '0' });
	expect((await listInvoices(a.companyId)).map((r) => r.contactName)).not.toContain('Rahasia PT B');
	expect((await listPurchaseOrders(a.companyId)).map((r) => r.contactName)).not.toContain('Rahasia PT B');
});

test('listContacts activeOnly hides deactivated contacts', async () => {
	const { companyId } = await makeCompany();
	const { id } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Lama' });
	await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Baru' });
	await updateContact(companyId, id, { isActive: false });
	expect((await listContacts(companyId, { kind: 'CUSTOMER', activeOnly: true })).map((c) => c.name)).toEqual(['PT Baru']);
	expect(await listContacts(companyId, { kind: 'CUSTOMER' })).toHaveLength(2);
});

// ---- Minor 5: empty contact update ----

test('updateContact with an empty input is a no-op, and still 404s for an unknown contact', async () => {
	const { companyId } = await makeCompany();
	const { id } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Tetap' });
	await updateContact(companyId, id, {});
	expect((await listContacts(companyId))[0].name).toBe('PT Tetap');
	await expect(updateContact(companyId, '00000000-0000-4000-8000-000000000000', {})).rejects.toMatchObject({ status: 404 });
});

// ---- Minor 2: accounts are re-validated at posting time ----

test('receiving a PO whose payable account was deactivated after the Draft was created is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await createPurchaseOrder(companyId, u.id, await poInput(companyId, await contact(companyId, 'VENDOR')));
	await issuePurchaseOrder(companyId, u.id, id);
	await db.update(accounts).set({ isActive: false }).where(eq(accounts.id, await accountIdByCode(companyId, '2-1001')));
	await expect(receivePurchaseOrder(companyId, u.id, id, '2026-10-15')).rejects.toMatchObject({ code: 'invalid_account' });
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }))?.status).toBe('ISSUED');
});

// ---- Minor 4: tax rate capped at 100 ----

test('taxRate above 100 is rejected by both schemas; 100 and 11.5 are accepted', () => {
	const base = { contactId: '00000000-0000-4000-8000-000000000000', issueDate: '2026-10-01', taxAccountId: '00000000-0000-4000-8000-000000000000' };
	const inv = { contactId: base.contactId, issueDate: base.issueDate, lines: [{ description: 'x', quantity: '1', unitPrice: '1' }] };
	const po = { ...base, payableAccountId: base.contactId, lines: [{ description: 'x', quantity: '1', unitPrice: '1', expenseAccountId: base.contactId }] };
	for (const rate of ['100.01', '101', '999.99']) {
		expect(CreateInvoiceInput.safeParse({ ...inv, taxRate: rate }).success).toBe(false);
		expect(CreatePurchaseOrderInput.safeParse({ ...po, taxRate: rate }).success).toBe(false);
	}
	for (const rate of ['100', '11.5', '0']) {
		expect(CreateInvoiceInput.safeParse({ ...inv, taxRate: rate }).success).toBe(true);
		expect(CreatePurchaseOrderInput.safeParse({ ...po, taxRate: rate }).success).toBe(true);
	}
});
