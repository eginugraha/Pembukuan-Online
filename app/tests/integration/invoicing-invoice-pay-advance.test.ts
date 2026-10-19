import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { invoices, advanceReceipts, contacts, journalEntries } from '../../src/lib/server/db/schema';
import { createInvoice, sendInvoice, payInvoiceByAdvanceReceipt, cancelInvoice } from '../../src/lib/server/invoicing/invoices';
import { createAdvanceReceipt } from '../../src/lib/server/invoicing/advance-receipts';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup(companyId: string, userId: string) {
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const deferred = await accountIdByCode(companyId, '2-1007');
	const { id: invoiceId } = await createInvoice(companyId, userId, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000000', revenueAccountId: revenue }] });
	await sendInvoice(companyId, userId, invoiceId, '2026-10-01');
	return { contact, invoiceId, receivable, deferred };
}

test('an exact-match advance receipt pays the invoice: Debit deferred-revenue / Credit receivable', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId, deferred } = await setup(companyId, u.id);
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });

	await payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10');

	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) }))?.status).toBe('PAID');
	expect((await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, receiptId) }))).toMatchObject({ status: 'APPLIED', appliedToInvoiceId: invoiceId });
});

test('a mismatched amount is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId, deferred } = await setup(companyId, u.id);
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '999999', deferredRevenueAccountId: deferred });
	await expect(payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10')).rejects.toMatchObject({ code: 'amount_mismatch' });
});

test('a receipt belonging to a different contact is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { invoiceId, deferred } = await setup(companyId, u.id);
	const [otherContact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Lain' }).returning();
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: otherContact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });
	await expect(payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10')).rejects.toMatchObject({ code: 'contact_mismatch' });
});

test('cancelling an invoice paid via an advance receipt releases the receipt back to ACTIVE', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId, deferred } = await setup(companyId, u.id);
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });
	await payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10');

	await cancelInvoice(companyId, u.id, invoiceId);

	expect((await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, receiptId) }))).toMatchObject({ status: 'ACTIVE', appliedToInvoiceId: null });
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, invoiceId))).toHaveLength(4); // send + pay-via-advance + 2 reversals
});
