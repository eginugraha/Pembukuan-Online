import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createContact, updateContact } from '../../src/lib/server/invoicing/contacts';
import { createInvoice, deleteInvoice, listInvoices, updateInvoice } from '../../src/lib/server/invoicing/invoices';
import {
	deletePaymentReceipt,
	getPaymentReceiptForInvoice,
	issuePaymentReceipt
} from '../../src/lib/server/invoicing/payment-receipts';
import { db } from '../../src/lib/server/db';
import { companies, contacts, journalEntries, paymentReceipts } from '../../src/lib/server/db/schema';
import { makeCompany, makeContact, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const line = (description: string, quantity = '1', unitPrice = '1000000') => ({ description, quantity, unitPrice });

async function setup() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id: contactId } = await createContact(companyId, {
		kind: 'CUSTOMER',
		name: 'PT Pelanggan',
		code: 'PLG',
		attention: 'Budi',
		position: 'Direktur',
		address: 'Jl. Lama 1',
		email: 'budi@pelanggan.test',
		phone: '0812',
		npwp: '01.234.567.8-901.000'
	});
	const { id: invoiceId } = await createInvoice(companyId, u.id, {
		contactId,
		issueDate: '2026-10-01',
		subject: 'Jasa Konsultasi',
		currency: 'USD',
		discount: '100',
		taxRate: '11',
		notes: 'Terima kasih',
		lines: [line('Konsultasi', '2', '500'), line('Laporan', '1', '300')]
	});
	return { companyId, userId: u.id, contactId, invoiceId };
}

test('issue numbers by payment date and get returns the full snapshot', async () => {
	const { companyId, userId, invoiceId } = await setup();
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-04-15' });
	const r = await getPaymentReceiptForInvoice(companyId, invoiceId);
	expect(r).not.toBeNull();
	expect(r!).toMatchObject({
		companyId,
		invoiceId,
		receiptNo: '001/UJI-PLG/RCP/IV/2026',
		paymentDate: '2026-04-15',
		invoiceNo: '001/UJI-PLG/INV/X/2026',
		subject: 'Jasa Konsultasi',
		currency: 'USD',
		subtotal: '1300.00',
		discount: '100.00',
		taxRate: '11.00',
		taxAmount: '132.00',
		total: '1332.00',
		notes: 'Terima kasih',
		contact: {
			name: 'PT Pelanggan',
			attention: 'Budi',
			position: 'Direktur',
			address: 'Jl. Lama 1',
			email: 'budi@pelanggan.test',
			phone: '0812',
			npwp: '01.234.567.8-901.000'
		}
	});
	expect(r!.lines.map((l) => ({ lineNo: l.lineNo, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount }))).toEqual([
		{ lineNo: 1, description: 'Konsultasi', quantity: '2.00', unitPrice: '500.00', amount: '1000.00' },
		{ lineNo: 2, description: 'Laporan', quantity: '1.00', unitPrice: '300.00', amount: '300.00' }
	]);
	expect(r!.createdAt).toBeInstanceOf(Date);
});

test('receipt is a fixed snapshot: later invoice and contact edits do not change it', async () => {
	const { companyId, userId, contactId, invoiceId } = await setup();
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	await updateInvoice(companyId, invoiceId, { contactId, issueDate: '2026-10-01', subject: 'Perihal Baru', currency: 'IDR', lines: [line('Baris Baru', '1', '5')] });
	await updateContact(companyId, contactId, { name: 'PT Nama Baru', address: 'Jl. Baru 2' });
	const r = await getPaymentReceiptForInvoice(companyId, invoiceId);
	expect(r).toMatchObject({ subject: 'Jasa Konsultasi', currency: 'USD', total: '1332.00', contact: { name: 'PT Pelanggan', address: 'Jl. Lama 1' } });
	expect(r!.lines.map((l) => l.description)).toEqual(['Konsultasi', 'Laporan']);
});

test('two concurrent issues: exactly one succeeds, the other is 409 receipt_exists, and the counter is rolled back', async () => {
	const { companyId, userId, invoiceId } = await setup();
	const results = await Promise.allSettled([
		issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' }),
		issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' })
	]);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	const rejected = results.filter((r) => r.status === 'rejected');
	expect(rejected).toHaveLength(1);
	expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'receipt_exists', message: 'Invoice ini sudah punya receipt' });

	await deletePaymentReceipt(companyId, invoiceId);
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-21' });
	expect((await getPaymentReceiptForInvoice(companyId, invoiceId))!.receiptNo).toBe('002/UJI-PLG/RCP/X/2026');
});

test('issuing again while a receipt is active gives 409 receipt_exists', async () => {
	const { companyId, userId, invoiceId } = await setup();
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	await expect(issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-21' })).rejects.toMatchObject({ status: 409, code: 'receipt_exists' });
});

test('missing company code gives 422 missing_company_code without a receipt or a counter bump', async () => {
	const { companyId, userId, invoiceId } = await setup();
	await db.update(companies).set({ code: null }).where(eq(companies.id, companyId));
	await expect(issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' })).rejects.toMatchObject({ status: 422, code: 'missing_company_code' });
	expect(await db.select().from(paymentReceipts).where(eq(paymentReceipts.companyId, companyId))).toHaveLength(0);
	await db.update(companies).set({ code: 'UJI' }).where(eq(companies.id, companyId));
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	expect((await getPaymentReceiptForInvoice(companyId, invoiceId))!.receiptNo).toBe('001/UJI-PLG/RCP/X/2026');
});

test('missing contact code gives 422 missing_contact_code without a receipt or a counter bump', async () => {
	const { companyId, userId, contactId, invoiceId } = await setup();
	await db.update(contacts).set({ code: null }).where(eq(contacts.id, contactId));
	await expect(issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' })).rejects.toMatchObject({ status: 422, code: 'missing_contact_code' });
	expect(await db.select().from(paymentReceipts).where(eq(paymentReceipts.companyId, companyId))).toHaveLength(0);
	await db.update(contacts).set({ code: 'PLG' }).where(eq(contacts.id, contactId));
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	expect((await getPaymentReceiptForInvoice(companyId, invoiceId))!.receiptNo).toBe('001/UJI-PLG/RCP/X/2026');
});

test('delete then reissue: null after delete, new number 002, second delete is 404', async () => {
	const { companyId, userId, invoiceId } = await setup();
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	await deletePaymentReceipt(companyId, invoiceId);
	expect(await getPaymentReceiptForInvoice(companyId, invoiceId)).toBeNull();
	await expect(deletePaymentReceipt(companyId, invoiceId)).rejects.toMatchObject({ status: 404 });
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	expect((await getPaymentReceiptForInvoice(companyId, invoiceId))!.receiptNo).toBe('002/UJI-PLG/RCP/X/2026');
	const all = await db.select({ receiptNo: paymentReceipts.receiptNo }).from(paymentReceipts).where(eq(paymentReceipts.invoiceId, invoiceId));
	expect(all.map((r) => r.receiptNo).sort()).toEqual(['001/UJI-PLG/RCP/X/2026', '002/UJI-PLG/RCP/X/2026']);
});

test('a deleted invoice cannot issue; an invoice with an active receipt cannot be deleted until the receipt is', async () => {
	const { companyId, userId, invoiceId } = await setup();
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	await expect(deleteInvoice(companyId, invoiceId)).rejects.toMatchObject({ status: 409, code: 'invoice_has_receipt', message: 'Hapus receipt terlebih dahulu' });
	await deletePaymentReceipt(companyId, invoiceId);
	await deleteInvoice(companyId, invoiceId);
	await expect(issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' })).rejects.toMatchObject({ status: 404 });
});

test('issuing keeps working after the invoice contact is deleted', async () => {
	const { companyId, userId } = await setup();
	const { id: contactId } = await makeContact(companyId, 'CUSTOMER', { name: 'PT Nonaktif', isActive: true });
	const { id: invoiceId } = await createInvoice(companyId, userId, { contactId, issueDate: '2026-10-01', lines: [line('A')] });
	await db.update(contacts).set({ deletedAt: new Date(), isActive: false }).where(eq(contacts.id, contactId));
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	expect((await getPaymentReceiptForInvoice(companyId, invoiceId))!.contact.name).toBe('PT Nonaktif');
});

test('another company cannot issue, read, or delete it', async () => {
	const { companyId, userId, invoiceId } = await setup();
	const other = await makeCompany('PT Lain');
	await expect(issuePaymentReceipt(other.companyId, userId, invoiceId, { paymentDate: '2026-10-20' })).rejects.toMatchObject({ status: 404 });
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	expect(await getPaymentReceiptForInvoice(other.companyId, invoiceId)).toBeNull();
	await expect(deletePaymentReceipt(other.companyId, invoiceId)).rejects.toMatchObject({ status: 404 });
	expect(await getPaymentReceiptForInvoice(companyId, invoiceId)).not.toBeNull();
});

test('issuing writes no journal entries', async () => {
	const { companyId, userId, invoiceId } = await setup();
	const before = (await db.select().from(journalEntries).where(eq(journalEntries.companyId, companyId))).length;
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	expect(await db.select().from(journalEntries).where(eq(journalEntries.companyId, companyId))).toHaveLength(before);
});

test('listInvoices reports hasReceipt for active receipts only', async () => {
	const { companyId, userId, contactId, invoiceId } = await setup();
	const { id: plain } = await createInvoice(companyId, userId, { contactId, issueDate: '2026-10-02', lines: [line('B')] });
	await issuePaymentReceipt(companyId, userId, invoiceId, { paymentDate: '2026-10-20' });
	const flags = async () => Object.fromEntries((await listInvoices(companyId)).map((r) => [r.id, r.hasReceipt]));
	expect(await flags()).toEqual({ [invoiceId]: true, [plain]: false });
	await deletePaymentReceipt(companyId, invoiceId);
	expect(await flags()).toEqual({ [invoiceId]: false, [plain]: false });
});
