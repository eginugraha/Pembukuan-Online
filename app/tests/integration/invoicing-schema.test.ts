import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { contacts, invoices, invoiceLines, advanceReceipts, purchaseOrders, purchaseOrderLines, documentNumberCounters, journalEntries } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('new tables accept a minimal row each, scoped to the company', async () => {
	const { companyId } = await makeCompany();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'BOTH', name: 'PT Mitra' }).returning();
	const [invoice] = await db
		.insert(invoices)
		.values({ companyId, contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: await accountIdByCode(companyId, '1-1003'), subtotal: '0', total: '0' })
		.returning();
	await db.insert(invoiceLines).values({ invoiceId: invoice.id, lineNo: 1, description: 'Jasa', quantity: '1', unitPrice: '0', amount: '0', revenueAccountId: await accountIdByCode(companyId, '4-1001') });
	const [po] = await db
		.insert(purchaseOrders)
		.values({ companyId, contactId: contact.id, issueDate: '2026-10-01', payableAccountId: await accountIdByCode(companyId, '2-1001'), subtotal: '0', total: '0' })
		.returning();
	await db.insert(purchaseOrderLines).values({ poId: po.id, lineNo: 1, description: 'Sewa', quantity: '1', unitPrice: '0', amount: '0', expenseAccountId: await accountIdByCode(companyId, '5-2010') });
	await db.insert(advanceReceipts).values({ companyId, contactId: contact.id, receiptNo: 'UM-2026-0001', receiptDate: '2026-10-01', amount: '0', deferredRevenueAccountId: await accountIdByCode(companyId, '2-1007') });
	await db.insert(documentNumberCounters).values({ companyId, prefix: 'INV', year: '2026', lastSeq: 1 });

	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, invoice.id) }))?.status).toBe('DRAFT');
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, po.id) }))?.status).toBe('DRAFT');
});

test('journal_entries accepts the new nullable back-link columns, defaulting to null', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [entry] = await db.insert(journalEntries).values({ companyId, type: 'TRANSACTION', entryDate: '2026-10-01', createdBy: u.id }).returning();
	expect(entry.invoiceId).toBeNull();
	expect(entry.purchaseOrderId).toBeNull();
	expect(entry.advanceReceiptId).toBeNull();
});
