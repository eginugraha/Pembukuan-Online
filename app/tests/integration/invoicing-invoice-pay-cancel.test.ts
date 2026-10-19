import { beforeEach, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
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
	await cancelInvoice(companyId, u.id, id, { callerIsAdmin: true });
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('CANCELLED');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(0);
});

test('cancelling a SENT invoice reverses its posting journal', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	await cancelInvoice(companyId, u.id, id, { callerIsAdmin: true });
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('CANCELLED');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(2); // original + reversal
});

test('cancelling a PAID invoice reverses both its posting and payment journals', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	await payInvoiceByBank(companyId, u.id, id, '2026-10-10');
	await cancelInvoice(companyId, u.id, id, { callerIsAdmin: true });
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(4); // 2 originals + 2 reversals
});

test('cancelling a SENT invoice is rejected when the current fiscal period is closed (reversal propagates period_closed)', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	const { fiscalClosings } = await import('../../src/lib/server/db/schema');
	const retained = await accountIdByCode(companyId, '3-1001');
	// Reversal posts dated today (real date), so close a period covering today.
	await db.insert(fiscalClosings).values({ companyId, periodStart: '2026-01-01', periodEnd: '2026-12-31', retainedEarningsAccountId: retained, closedBy: u.id });
	await expect(cancelInvoice(companyId, u.id, id, { callerIsAdmin: true })).rejects.toMatchObject({ code: 'period_closed' });
	// Nothing was reversed and the invoice is still SENT, not left half-cancelled.
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('SENT');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(1);
});

test('cancelling a Draft invoice rejects if it was sent out from under it before the company lock was acquired', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { contacts } = await import('../../src/lib/server/db/schema');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const { id } = await createInvoice(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'x', quantity: '1', unitPrice: '1000', revenueAccountId: revenue }] });

	// Hold the company row lock in a separate transaction so cancelInvoice's own lock acquisition
	// blocks *after* its unlocked pre-read has already seen DRAFT -- deterministically reproducing
	// the race where a concurrent sendInvoice changes the status in the gap between that pre-read
	// and the lock being granted (the invoices row isn't touched by this lock, so the raw status
	// flip below is free to happen while cancelInvoice's transaction is queued waiting for it).
	let signalLockHeld!: () => void;
	const lockHeld = new Promise<void>((resolve) => (signalLockHeld = resolve));
	let releaseLock!: () => void;
	const releaseSignal = new Promise<void>((resolve) => (releaseLock = resolve));

	const holder = db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);
		signalLockHeld();
		await releaseSignal;
	});

	await lockHeld;

	const cancelPromise = cancelInvoice(companyId, u.id, id, { callerIsAdmin: true });
	// Give cancelInvoice's unlocked pre-read (sees DRAFT) time to run and queue behind the held lock.
	await new Promise((resolve) => setTimeout(resolve, 50));
	await db.update(invoices).set({ status: 'SENT' }).where(eq(invoices.id, id));
	releaseLock();
	await holder;

	await expect(cancelPromise).rejects.toMatchObject({ code: 'invalid_status' });
	// The invoice must be left exactly as the (simulated) concurrent sendInvoice left it: SENT, not
	// silently overwritten to CANCELLED by the stale Draft-cancel attempt.
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('SENT');
});

/** Tahan lock company di transaksi terpisah; `release()` melepasnya. */
async function holdCompanyLock(companyId: string) {
	let signalLockHeld!: () => void;
	const lockHeld = new Promise<void>((resolve) => (signalLockHeld = resolve));
	let release!: () => void;
	const releaseSignal = new Promise<void>((resolve) => (release = resolve));
	const holder = db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);
		signalLockHeld();
		await releaseSignal;
	});
	await lockHeld;
	return { release, holder };
}

async function draftInvoice(companyId: string, userId: string) {
	const { contacts } = await import('../../src/lib/server/db/schema');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const { id } = await createInvoice(companyId, userId, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'x', quantity: '1', unitPrice: '1000', revenueAccountId: revenue }] });
	return id;
}

test('a non-admin cancel that passed the route check against DRAFT is rejected with forbidden once the invoice is revealed SENT under the lock', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await draftInvoice(companyId, u.id);

	const { release, holder } = await holdCompanyLock(companyId);
	// Accountant-level caller: the route's role check saw DRAFT and so only required `accountant`.
	const cancelPromise = cancelInvoice(companyId, u.id, id, { callerIsAdmin: false });
	await new Promise((resolve) => setTimeout(resolve, 50));
	await db.update(invoices).set({ status: 'SENT' }).where(eq(invoices.id, id));
	release();
	await holder;

	await expect(cancelPromise).rejects.toMatchObject({ status: 403, code: 'forbidden' });
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('SENT');
});

test('a non-admin caller can never take the reversal branch for a SENT invoice', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await sentInvoice(companyId, u.id);
	await expect(cancelInvoice(companyId, u.id, id, { callerIsAdmin: false })).rejects.toMatchObject({ status: 403, code: 'forbidden' });
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('SENT');
	expect(await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, id))).toHaveLength(1);
});

test('a non-admin caller can still cancel a Draft invoice', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const id = await draftInvoice(companyId, u.id);
	await cancelInvoice(companyId, u.id, id, { callerIsAdmin: false });
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.status).toBe('CANCELLED');
});
