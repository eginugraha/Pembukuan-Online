import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { purchaseOrders, journalEntries, contacts } from '../../src/lib/server/db/schema';
import { createPurchaseOrder, issuePurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('creates a Draft PO with no number; Issued assigns a number but posts no journal', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'VENDOR', name: 'PT Pemasok' }).returning();
	const payable = await accountIdByCode(companyId, '2-1001');
	const expense = await accountIdByCode(companyId, '5-2010');

	const { id } = await createPurchaseOrder(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', payableAccountId: payable, lines: [{ description: 'Sewa server', quantity: '1', unitPrice: '2000000', expenseAccountId: expense }] });
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }))).toMatchObject({ status: 'DRAFT', poNo: null, total: '2000000.00' });

	await issuePurchaseOrder(companyId, u.id, id);
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }))).toMatchObject({ status: 'ISSUED', poNo: 'PO-2026-0001' });
	expect(await db.select().from(journalEntries).where(eq(journalEntries.purchaseOrderId, id))).toHaveLength(0);
});

test('rejects an expense account that is not actually an EXPENSE-type account', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'VENDOR', name: 'PT Pemasok' }).returning();
	const payable = await accountIdByCode(companyId, '2-1001');
	const revenueAccount = await accountIdByCode(companyId, '4-1001');
	await expect(
		createPurchaseOrder(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', payableAccountId: payable, lines: [{ description: 'x', quantity: '1', unitPrice: '1000', expenseAccountId: revenueAccount }] })
	).rejects.toMatchObject({ code: 'wrong_account_type' });
});
