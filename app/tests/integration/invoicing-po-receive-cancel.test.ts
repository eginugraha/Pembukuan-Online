import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { purchaseOrders, journalEntries, journalLines, contacts } from '../../src/lib/server/db/schema';
import { createPurchaseOrder, issuePurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function issuedPO(companyId: string, userId: string) {
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'VENDOR', name: 'PT Pemasok' }).returning();
	const payable = await accountIdByCode(companyId, '2-1001');
	const expense = await accountIdByCode(companyId, '5-2010');
	const { id } = await createPurchaseOrder(companyId, userId, { contactId: contact.id, issueDate: '2026-10-01', payableAccountId: payable, lines: [{ description: 'Sewa server', quantity: '1', unitPrice: '2000000', expenseAccountId: expense }] });
	await issuePurchaseOrder(companyId, userId, id);
	return { id, payable, expense };
}

test('receiving posts Debit expense / Credit payable, dated the receive date', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id, payable, expense } = await issuedPO(companyId, u.id);
	await receivePurchaseOrder(companyId, u.id, id, '2026-10-15');
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }))?.status).toBe('RECEIVED');
	const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.purchaseOrderId, id) });
	expect(entry?.entryDate).toBe('2026-10-15');
	const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, entry!.id));
	expect(lines.map((l) => [l.accountId, l.debit, l.credit]).sort()).toEqual([[expense, '2000000.00', '0.00'], [payable, '0.00', '2000000.00']].sort());
});

test('receiving into a closed fiscal period is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await issuedPO(companyId, u.id);
	const { fiscalClosings } = await import('../../src/lib/server/db/schema');
	const retained = await accountIdByCode(companyId, '3-1001');
	await db.insert(fiscalClosings).values({ companyId, periodStart: '2026-01-01', periodEnd: '2026-09-30', retainedEarningsAccountId: retained, closedBy: u.id });
	await expect(receivePurchaseOrder(companyId, u.id, id, '2026-09-15')).rejects.toMatchObject({ code: 'period_closed' });
});

test('cancelling an Issued (not yet Received) PO has nothing to reverse', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await issuedPO(companyId, u.id);
	await cancelPurchaseOrder(companyId, u.id, id);
	expect((await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }))?.status).toBe('CANCELLED');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.purchaseOrderId, id))).toHaveLength(0);
});

test('cancelling a Received PO reverses its journal', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id } = await issuedPO(companyId, u.id);
	await receivePurchaseOrder(companyId, u.id, id, '2026-10-15');
	await cancelPurchaseOrder(companyId, u.id, id);
	expect(await db.select().from(journalEntries).where(eq(journalEntries.purchaseOrderId, id))).toHaveLength(2);
});
