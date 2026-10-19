import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { invoices, journalEntries } from '../../src/lib/server/db/schema';
import { createInvoice, sendInvoice, payInvoiceByBank, cancelInvoice } from '../../src/lib/server/invoicing/invoices';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function sentInvoice(companyId: string, userId: string) {
	const { contacts } = await import('../../src/lib/server/db/schema');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const { id } = await createInvoice(companyId, userId, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000000', revenueAccountId: revenue }] });
	await sendInvoice(companyId, userId, id, '2026-10-05');
	return id;
}

test('paying by bank debits the bank account and credits the receivable, marks PAID', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	await payInvoiceByBank(companyId, u.id, id, '2026-10-10');
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('PAID');
	const entries = await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id));
	expect(entries).toHaveLength(2); // Kirim + Lunas
});

test('paying into a closed fiscal period is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	const { fiscalClosings } = await import('../../src/lib/server/db/schema');
	const retained = await accountIdByCode(companyId, '3-1001');
	await db.insert(fiscalClosings).values({ companyId, periodStart: '2026-01-01', periodEnd: '2026-09-30', retainedEarningsAccountId: retained, closedBy: u.id });
	await expect(payInvoiceByBank(companyId, u.id, id, '2026-09-15')).rejects.toMatchObject({ code: 'period_closed' });
});

test('cancelling a Draft invoice just changes status, no journal at all', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contacts } = await import('../../src/lib/server/db/schema');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const { id } = await createInvoice(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'x', quantity: '1', unitPrice: '1000', revenueAccountId: revenue }] });
	await cancelInvoice(companyId, u.id, id);
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('CANCELLED');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(0);
});

test('cancelling a SENT invoice reverses its posting journal', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	await cancelInvoice(companyId, u.id, id);
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('CANCELLED');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(2); // original + reversal
});

test('cancelling a PAID invoice reverses both its posting and payment journals', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	await payInvoiceByBank(companyId, u.id, id, '2026-10-10');
	await cancelInvoice(companyId, u.id, id);
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(4); // 2 originals + 2 reversals
});
