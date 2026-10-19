import { beforeEach, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { invoices, advanceReceipts, contacts, journalEntries, journalLines } from '../../src/lib/server/db/schema';
import { createInvoice, sendInvoice, payInvoiceByAdvanceReceipt, payInvoiceByBank, cancelInvoice } from '../../src/lib/server/invoicing/invoices';
import { createAdvanceReceipt, cancelAdvanceReceipt } from '../../src/lib/server/invoicing/advance-receipts';
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
	return { contact, invoiceId, receivable, revenue, deferred };
}

/** Bikin invoice SENT lain untuk kontak yang sama, dengan nominal yang bisa diatur sendiri. */
async function anotherSentInvoice(companyId: string, userId: string, contactId: string, receivableAccountId: string, revenueAccountId: string, unitPrice: string) {
	const { id } = await createInvoice(companyId, userId, {
		contactId,
		issueDate: '2026-10-01',
		receivableAccountId,
		lines: [{ description: 'Jasa lain', quantity: '1', unitPrice, revenueAccountId: revenueAccountId }]
	});
	await sendInvoice(companyId, userId, id, '2026-10-01');
	return id;
}

test('an exact-match advance receipt pays the invoice: Debit deferred-revenue / Credit receivable', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId, receivable, deferred } = await setup(companyId, u.id);
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });

	await payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10');

	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) }))?.status).toBe('PAID');
	expect((await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, receiptId) }))).toMatchObject({ status: 'APPLIED', appliedToInvoiceId: invoiceId });

	// Jurnal pelunasan harus punya kedua back-link (invoiceId DAN advanceReceiptId) sekaligus, dan
	// baris-barisnya harus benar: Dr pendapatan diterima dimuka / Cr piutang.
	const payEntry = await db.query.journalEntries.findFirst({
		where: and(eq(journalEntries.invoiceId, invoiceId), eq(journalEntries.advanceReceiptId, receiptId))
	});
	expect(payEntry).toBeTruthy();
	const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, payEntry!.id));
	expect(lines).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ accountId: deferred, debit: '1000000.00', credit: '0.00' }),
			expect.objectContaining({ accountId: receivable, debit: '0.00', credit: '1000000.00' })
		])
	);
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

test('a receipt that is already APPLIED is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId: invoiceAId, receivable, revenue, deferred } = await setup(companyId, u.id);
	const invoiceBId = await anotherSentInvoice(companyId, u.id, contact.id, receivable, revenue, '1000000');

	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });
	await payInvoiceByAdvanceReceipt(companyId, u.id, invoiceAId, receiptId, '2026-10-10'); // receipt -> APPLIED

	await expect(payInvoiceByAdvanceReceipt(companyId, u.id, invoiceBId, receiptId, '2026-10-11')).rejects.toMatchObject({ code: 'invalid_status' });
});

test('a REFUNDED receipt is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId, deferred } = await setup(companyId, u.id);
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });
	await cancelAdvanceReceipt(companyId, u.id, receiptId); // receipt -> REFUNDED

	await expect(payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10')).rejects.toMatchObject({ code: 'invalid_status' });
});

test('cancelling an invoice paid via an advance receipt releases the receipt back to ACTIVE', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId, deferred } = await setup(companyId, u.id);
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });
	await payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10');

	await cancelInvoice(companyId, u.id, invoiceId, { callerIsAdmin: true });

	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) }))?.status).toBe('CANCELLED');
	expect((await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, receiptId) }))).toMatchObject({ status: 'ACTIVE', appliedToInvoiceId: null });

	const entries = await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, invoiceId));
	expect(entries).toHaveLength(4); // send + pay-via-advance + 2 reversals

	// Setiap entry harus tetap balans (total debit = total credit per jurnal), dan secara total juga balans.
	let totalDebit = 0;
	let totalCredit = 0;
	for (const entry of entries) {
		const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, entry.id));
		const debit = lines.reduce((sum, l) => sum + Number(l.debit), 0);
		const credit = lines.reduce((sum, l) => sum + Number(l.credit), 0);
		expect(debit).toBeCloseTo(credit, 5);
		totalDebit += debit;
		totalCredit += credit;
	}
	expect(totalDebit).toBeCloseTo(totalCredit, 5);
});

test('cancelling a bank-paid invoice leaves an unrelated, separately-applied advance receipt untouched', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId: invoiceAId, receivable, revenue, deferred } = await setup(companyId, u.id);
	const invoiceBId = await anotherSentInvoice(companyId, u.id, contact.id, receivable, revenue, '500000');
	await payInvoiceByBank(companyId, u.id, invoiceBId, '2026-10-05');

	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });
	await payInvoiceByAdvanceReceipt(companyId, u.id, invoiceAId, receiptId, '2026-10-10');

	await cancelInvoice(companyId, u.id, invoiceBId, { callerIsAdmin: true });

	expect((await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, receiptId) }))).toMatchObject({ status: 'APPLIED', appliedToInvoiceId: invoiceAId });
});

test("refunding an advance receipt after its invoice was already cancelled only reverses the receipt's own entry", async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contact, invoiceId, deferred } = await setup(companyId, u.id);
	const { id: receiptId } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });
	await payInvoiceByAdvanceReceipt(companyId, u.id, invoiceId, receiptId, '2026-10-10');
	await cancelInvoice(companyId, u.id, invoiceId, { callerIsAdmin: true });

	const invoiceEntriesBefore = await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, invoiceId));
	const receiptEntriesBefore = await db.select().from(journalEntries).where(eq(journalEntries.advanceReceiptId, receiptId));
	expect(invoiceEntriesBefore).toHaveLength(4); // send, pay-via-advance, reversal-of-send, reversal-of-pay
	expect(receiptEntriesBefore).toHaveLength(3); // creation, pay-via-advance, reversal-of-pay

	await cancelAdvanceReceipt(companyId, u.id, receiptId);

	const invoiceEntriesAfter = await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, invoiceId));
	const receiptEntriesAfter = await db.select().from(journalEntries).where(eq(journalEntries.advanceReceiptId, receiptId));
	// The already-cancelled invoice's own journal history must be completely untouched: refunding
	// the receipt must NOT re-reverse the invoice-linked entries that happen to also carry this
	// receipt's id (the pay-via-advance entry and its reversal).
	expect(invoiceEntriesAfter).toHaveLength(4);
	// Exactly one new entry: the reversal of the receipt's own (unlinked) creation entry.
	expect(receiptEntriesAfter).toHaveLength(4);
	expect((await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, receiptId) }))?.status).toBe('REFUNDED');
});
