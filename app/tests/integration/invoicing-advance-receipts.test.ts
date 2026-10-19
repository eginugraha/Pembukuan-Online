import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { advanceReceipts, journalEntries, journalLines, contacts } from '../../src/lib/server/db/schema';
import { createAdvanceReceipt, cancelAdvanceReceipt } from '../../src/lib/server/invoicing/advance-receipts';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('creating posts immediately: Debit Bank / Credit deferred-revenue, dated receiptDate, numbered UM-year-NNNN', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const deferred = await accountIdByCode(companyId, '2-1007');

	const { id } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '5000000', deferredRevenueAccountId: deferred });

	const receipt = await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, id) });
	expect(receipt).toMatchObject({ status: 'ACTIVE', receiptNo: 'UM-2026-0001', amount: '5000000.00' });
	const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.advanceReceiptId, id) });
	expect(entry).toMatchObject({ entryDate: '2026-10-02', refNo: 'UM-2026-0001' });
	const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, entry!.id));
	expect(lines.map((l) => [l.accountId, l.debit, l.credit]).sort()).toEqual([[bankAccountId, '5000000.00', '0.00'], [deferred, '0.00', '5000000.00']].sort());
});

test('recording a receipt dated into a closed fiscal period is rejected', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const deferred = await accountIdByCode(companyId, '2-1007');
	const { fiscalClosings } = await import('../../src/lib/server/db/schema');
	const retained = await accountIdByCode(companyId, '3-1001');
	await db.insert(fiscalClosings).values({ companyId, periodStart: '2026-01-01', periodEnd: '2026-09-30', retainedEarningsAccountId: retained, closedBy: u.id });
	await expect(createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-09-15', amount: '1000000', deferredRevenueAccountId: deferred })).rejects.toMatchObject({ code: 'period_closed' });
});

test('cancelling an ACTIVE receipt reverses its journal and marks it REFUNDED', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const deferred = await accountIdByCode(companyId, '2-1007');
	const { id } = await createAdvanceReceipt(companyId, u.id, { contactId: contact.id, receiptDate: '2026-10-02', amount: '1000000', deferredRevenueAccountId: deferred });

	await cancelAdvanceReceipt(companyId, u.id, id);

	expect((await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, id) }))?.status).toBe('REFUNDED');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.advanceReceiptId, id))).toHaveLength(2);
});
