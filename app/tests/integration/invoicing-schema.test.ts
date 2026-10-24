import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { contacts, invoices, invoiceLines, purchaseOrders, purchaseOrderLines, documentNumberCounters } from '../../src/lib/server/db/schema';
import { makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('new tables accept a minimal row each, scoped to the company', async () => {
	const { companyId } = await makeCompany();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'BOTH', name: 'PT Mitra' }).returning();
	const [invoice] = await db
		.insert(invoices)
		.values({ companyId, contactId: contact.id, invoiceNo: 'INV-2026-0001', issueDate: '2026-10-01', subtotal: '0', total: '0' })
		.returning();
	await db.insert(invoiceLines).values({ invoiceId: invoice.id, lineNo: 1, description: 'Jasa', quantity: '1', unitPrice: '0', amount: '0' });
	const [po] = await db
		.insert(purchaseOrders)
		.values({ companyId, contactId: contact.id, poNo: 'PO-2026-0001', issueDate: '2026-10-01', subtotal: '0', total: '0' })
		.returning();
	await db.insert(purchaseOrderLines).values({ poId: po.id, lineNo: 1, description: 'Sewa', quantity: '1', unitPrice: '0', amount: '0' });
	await db.insert(documentNumberCounters).values({ companyId, prefix: 'INV', year: '2026', lastSeq: 1 });

	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, invoice.id) }))?.deletedAt).toBeNull();
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, po.id) }))?.deletedAt).toBeNull();
});
