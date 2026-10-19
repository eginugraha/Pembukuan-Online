import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { invoices, journalEntries, journalLines } from '../../src/lib/server/db/schema';
import { createInvoice, sendInvoice } from '../../src/lib/server/invoicing/invoices';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function draftInvoice(companyId: string) {
	const { contacts } = await import('../../src/lib/server/db/schema');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	return createInvoice(companyId, (await makeUser()).id, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000000', revenueAccountId: revenue }] });
}

test('sending assigns a sequential number and posts a balanced journal debiting the receivable', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await draftInvoice(companyId);

	await sendInvoice(companyId, u.id, id, '2026-10-05');

	const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
	expect(invoice).toMatchObject({ status: 'SENT', invoiceNo: 'INV-2026-0001' });
	const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.invoiceId, id) });
	expect(entry).toMatchObject({ entryDate: '2026-10-05', refNo: 'INV-2026-0001' });
	const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, entry!.id));
	expect(lines.map((l) => [l.debit, l.credit]).sort()).toEqual([['0.00', '1000000.00'], ['1000000.00', '0.00']]);
});

test('a second invoice gets the next sequential number', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const first = await draftInvoice(companyId);
	const second = await draftInvoice(companyId);
	await sendInvoice(companyId, u.id, first.id, '2026-10-05');
	await sendInvoice(companyId, u.id, second.id, '2026-10-05');
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, second.id) }))?.invoiceNo).toBe('INV-2026-0002');
});

test('sending into a closed fiscal period is rejected', async () => {
	// Reuses the existing closing-lock mechanism: insert a fiscal_closings row covering the send date.
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await draftInvoice(companyId);
	const { fiscalClosings, accounts } = await import('../../src/lib/server/db/schema');
	const retained = await accountIdByCode(companyId, '3-1001');
	await db.insert(fiscalClosings).values({ companyId, periodStart: '2026-01-01', periodEnd: '2026-09-30', retainedEarningsAccountId: retained, closedBy: u.id });
	await expect(sendInvoice(companyId, u.id, id, '2026-09-15')).rejects.toMatchObject({ code: 'period_closed' });
});

test('sending an already-sent invoice is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await draftInvoice(companyId);
	await sendInvoice(companyId, u.id, id, '2026-10-05');
	await expect(sendInvoice(companyId, u.id, id, '2026-10-06')).rejects.toMatchObject({ code: 'invalid_status' });
});
