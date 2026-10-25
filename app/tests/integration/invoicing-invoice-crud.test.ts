import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createContact, deleteContact } from '../../src/lib/server/invoicing/contacts';
import { CreateInvoiceInput } from '../../src/lib/schemas/invoice';
import { createInvoice, deleteInvoice, getInvoice, listInvoices, updateInvoice } from '../../src/lib/server/invoicing/invoices';
import { db } from '../../src/lib/server/db';
import { invoiceLines, journalEntries } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id: contactId } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Pelanggan' });
	return { companyId, userId: u.id, contactId };
}
const line = (description: string, quantity = '1', unitPrice = '1000000') => ({ description, quantity, unitPrice });

test('create assigns INV-<year of issueDate>-0001, computes totals, and writes no journal', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createInvoice(companyId, userId, { contactId, issueDate: '2026-10-01', taxRate: '11', lines: [line('Jasa', '2', '500000.50')] });
	const inv = await getInvoice(companyId, id);
	expect(inv.invoiceNo).toBe('INV-2026-0001');
	expect(inv).toMatchObject({ subtotal: '1000001.00', taxAmount: '110000.11', total: '1110001.11' });
	expect(await db.select().from(journalEntries).where(eq(journalEntries.companyId, companyId))).toHaveLength(0);
});

test('update replaces header and all lines and keeps the number', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createInvoice(companyId, userId, { contactId, issueDate: '2026-10-01', lines: [line('A'), line('B'), line('C')] });
	await updateInvoice(companyId, id, { contactId, issueDate: '2027-01-05', notes: 'revisi', lines: [line('Satu-satunya', '3', '100')] });
	const inv = await getInvoice(companyId, id);
	expect(inv.invoiceNo).toBe('INV-2026-0001');
	expect(inv).toMatchObject({ issueDate: '2027-01-05', notes: 'revisi', subtotal: '300.00', total: '300.00' });
	expect(inv.lines.map((l) => l.description)).toEqual(['Satu-satunya']);
	expect(await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id))).toHaveLength(1);
});

test('delete soft-deletes: gone from list/get, repeat delete and update give 404, number is not reused', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createInvoice(companyId, userId, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	await deleteInvoice(companyId, id);
	expect(await listInvoices(companyId)).toEqual([]);
	await expect(getInvoice(companyId, id)).rejects.toMatchObject({ status: 404 });
	await expect(deleteInvoice(companyId, id)).rejects.toMatchObject({ status: 404 });
	await expect(updateInvoice(companyId, id, { contactId, issueDate: '2026-10-01', lines: [line('A')] })).rejects.toMatchObject({ status: 404 });
	const next = await createInvoice(companyId, userId, { contactId, issueDate: '2026-10-02', lines: [line('B')] });
	expect((await getInvoice(companyId, next.id)).invoiceNo).toBe('INV-2026-0002');
});

test('another company cannot get, update, or delete it', async () => {
	const { companyId, userId, contactId } = await setup();
	const other = await makeCompany('PT Lain');
	const { id } = await createInvoice(companyId, userId, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	await expect(getInvoice(other.companyId, id)).rejects.toMatchObject({ status: 404 });
	await expect(updateInvoice(other.companyId, id, { contactId, issueDate: '2026-10-01', lines: [line('A')] })).rejects.toMatchObject({ status: 404 });
	await expect(deleteInvoice(other.companyId, id)).rejects.toMatchObject({ status: 404 });
});

test('keeps working after its contact is deleted; switching to a deleted contact is rejected', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id: otherContact } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Lain' });
	const { id } = await createInvoice(companyId, userId, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	await deleteContact(companyId, contactId);
	await deleteContact(companyId, otherContact);
	await updateInvoice(companyId, id, { contactId, issueDate: '2026-10-01', notes: 'tetap boleh', lines: [line('A')] });
	expect((await listInvoices(companyId))[0].contactName).toBe('PT Pelanggan');
	await expect(updateInvoice(companyId, id, { contactId: otherContact, issueDate: '2026-10-01', lines: [line('A')] })).rejects.toMatchObject({ status: 404 });
});

test('a vendor-only contact cannot be used on an invoice', async () => {
	const { companyId, userId } = await setup();
	const { id: vendor } = await createContact(companyId, { kind: 'VENDOR', name: 'PT Vendor' });
	await expect(createInvoice(companyId, userId, { contactId: vendor, issueDate: '2026-10-01', lines: [line('A')] })).rejects.toMatchObject({ code: 'wrong_contact_kind' });
});

test('tax rate empty/0 gives 0.00 tax, 100 gives tax equal to subtotal', async () => {
	const { companyId, userId, contactId } = await setup();
	const make = async (taxRate?: string) =>
		getInvoice(companyId, (await createInvoice(companyId, userId, { contactId, issueDate: '2026-10-01', taxRate, lines: [line('A', '1', '250')] })).id);
	expect((await make()).taxAmount).toBe('0.00');
	expect((await make('0')).taxAmount).toBe('0.00');
	expect(await make('100')).toMatchObject({ taxAmount: '250.00', total: '500.00' });
});

test('due date is stored, can be changed or cleared, and may not precede the issue date', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createInvoice(companyId, userId, { contactId, issueDate: '2026-10-01', dueDate: '2026-10-31', lines: [line('A')] });
	expect((await getInvoice(companyId, id)).dueDate).toBe('2026-10-31');
	await updateInvoice(companyId, id, { contactId, issueDate: '2026-10-01', dueDate: '2026-11-15', lines: [line('A')] });
	expect((await getInvoice(companyId, id)).dueDate).toBe('2026-11-15');
	await updateInvoice(companyId, id, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	expect((await getInvoice(companyId, id)).dueDate).toBeNull();
	expect(CreateInvoiceInput.safeParse({ contactId, issueDate: '2026-10-10', dueDate: '2026-10-09', lines: [line('A')] }).success).toBe(false);
});
