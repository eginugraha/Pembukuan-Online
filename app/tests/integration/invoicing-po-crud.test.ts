import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createContact, deleteContact } from '../../src/lib/server/invoicing/contacts';
import { createPurchaseOrder, deletePurchaseOrder, getPurchaseOrder, listPurchaseOrders, updatePurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { db } from '../../src/lib/server/db';
import { journalEntries, purchaseOrderLines } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id: contactId } = await createContact(companyId, { kind: 'VENDOR', name: 'PT Pemasok', code: 'PLG' });
	return { companyId, userId: u.id, contactId };
}
const line = (description: string, quantity = '1', unitPrice = '1000000') => ({ description, quantity, unitPrice });

test('create assigns 001/<codes>/PO/<month>/<year of issueDate>, computes totals, and writes no journal', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-01', taxRate: '11', lines: [line('Sewa', '2', '500000.50')] });
	const po = await getPurchaseOrder(companyId, id);
	expect(po.poNo).toBe('001/UJI-PLG/PO/X/2026');
	expect(po).toMatchObject({ subtotal: '1000001.00', taxAmount: '110000.11', total: '1110001.11' });
	expect(await db.select().from(journalEntries).where(eq(journalEntries.companyId, companyId))).toHaveLength(0);
});

test('update replaces header, expected date and all lines and keeps the number', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-01', expectedDate: '2026-10-20', lines: [line('A'), line('B'), line('C')] });
	await updatePurchaseOrder(companyId, id, { contactId, issueDate: '2027-01-05', expectedDate: '2027-01-30', notes: 'revisi', lines: [line('Satu-satunya', '3', '100')] });
	const po = await getPurchaseOrder(companyId, id);
	expect(po.poNo).toBe('001/UJI-PLG/PO/X/2026');
	expect(po).toMatchObject({ issueDate: '2027-01-05', expectedDate: '2027-01-30', notes: 'revisi', subtotal: '300.00', total: '300.00' });
	expect(po.lines.map((l) => l.description)).toEqual(['Satu-satunya']);
	expect(await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id))).toHaveLength(1);
});

test('currency defaults to IDR; subject and currency are saved, and an update without currency keeps it', async () => {
	const { companyId, userId, contactId } = await setup();
	const plain = await createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	expect(await getPurchaseOrder(companyId, plain.id)).toMatchObject({ currency: 'IDR', subject: null });

	const { id } = await createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-01', subject: 'Server', currency: 'USD', lines: [line('A')] });
	expect(await getPurchaseOrder(companyId, id)).toMatchObject({ currency: 'USD', subject: 'Server' });
	await updatePurchaseOrder(companyId, id, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	expect(await getPurchaseOrder(companyId, id)).toMatchObject({ currency: 'USD', subject: null });
	expect((await listPurchaseOrders(companyId)).find((r) => r.id === id)?.currency).toBe('USD');
});

test('delete soft-deletes: gone from list/get, repeat delete and update give 404, number is not reused', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	await deletePurchaseOrder(companyId, id);
	expect(await listPurchaseOrders(companyId)).toEqual([]);
	await expect(getPurchaseOrder(companyId, id)).rejects.toMatchObject({ status: 404 });
	await expect(deletePurchaseOrder(companyId, id)).rejects.toMatchObject({ status: 404 });
	await expect(updatePurchaseOrder(companyId, id, { contactId, issueDate: '2026-10-01', lines: [line('A')] })).rejects.toMatchObject({ status: 404 });
	const next = await createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-02', lines: [line('B')] });
	expect((await getPurchaseOrder(companyId, next.id)).poNo).toBe('002/UJI-PLG/PO/X/2026');
});

test('another company cannot get, update, or delete it', async () => {
	const { companyId, userId, contactId } = await setup();
	const other = await makeCompany('PT Lain');
	const { id } = await createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	await expect(getPurchaseOrder(other.companyId, id)).rejects.toMatchObject({ status: 404 });
	await expect(updatePurchaseOrder(other.companyId, id, { contactId, issueDate: '2026-10-01', lines: [line('A')] })).rejects.toMatchObject({ status: 404 });
	await expect(deletePurchaseOrder(other.companyId, id)).rejects.toMatchObject({ status: 404 });
});

test('keeps working after its contact is deleted; switching to another contact is rejected', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id: otherContact } = await createContact(companyId, { kind: 'VENDOR', name: 'PT Lain' });
	const { id } = await createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	await deleteContact(companyId, contactId);
	await deleteContact(companyId, otherContact);
	await updatePurchaseOrder(companyId, id, { contactId, issueDate: '2026-10-01', notes: 'tetap boleh', lines: [line('A')] });
	expect((await listPurchaseOrders(companyId))[0].contactName).toBe('PT Pemasok');
	await expect(updatePurchaseOrder(companyId, id, { contactId: otherContact, issueDate: '2026-10-01', lines: [line('A')] })).rejects.toMatchObject({ status: 422, code: 'contact_locked' });
});

test('a customer-only contact cannot be used on a PO', async () => {
	const { companyId, userId } = await setup();
	const { id: customer } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Pelanggan' });
	await expect(createPurchaseOrder(companyId, userId, { contactId: customer, issueDate: '2026-10-01', lines: [line('A')] })).rejects.toMatchObject({ code: 'wrong_contact_kind' });
});

test('tax rate empty/0 gives 0.00 tax, 100 gives tax equal to subtotal', async () => {
	const { companyId, userId, contactId } = await setup();
	const make = async (taxRate?: string) =>
		getPurchaseOrder(companyId, (await createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-01', taxRate, lines: [line('A', '1', '250')] })).id);
	expect((await make()).taxAmount).toBe('0.00');
	expect((await make('0')).taxAmount).toBe('0.00');
	expect(await make('100')).toMatchObject({ taxAmount: '250.00', total: '500.00' });
});

test('update rejects a different active contact with 422 contact_locked and keeps the original', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id: otherContact } = await createContact(companyId, { kind: 'VENDOR', name: 'PT Lain', code: 'LAN' });
	const { id } = await createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	await expect(updatePurchaseOrder(companyId, id, { contactId: otherContact, issueDate: '2026-10-01', lines: [line('A')] })).rejects.toMatchObject({
		status: 422,
		code: 'contact_locked'
	});
	expect((await getPurchaseOrder(companyId, id)).contactId).toBe(contactId);
});
