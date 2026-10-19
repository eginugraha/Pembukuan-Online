import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { journalEntries, journalLines, contacts, invoices, advanceReceipts } from '../../src/lib/server/db/schema';
import { postJournal, reverseJournalEntries } from '../../src/lib/server/invoicing/posting';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('postJournal inserts a balanced entry and sets the requested back-link column', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const revenue = await accountIdByCode(companyId, '4-1001');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const [invoice] = await db.insert(invoices).values({ companyId, contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: bankAccountId, subtotal: '0', total: '0' }).returning();

	const { id } = await db.transaction((tx) =>
		postJournal(tx, {
			companyId, createdBy: u.id, entryDate: '2026-10-01', description: 'Invoice INV-2026-0001', refNo: 'INV-2026-0001',
			lines: [{ accountId: bankAccountId, debit: '100000.00', credit: '0.00' }, { accountId: revenue, debit: '0.00', credit: '100000.00' }],
			invoiceId: invoice.id
		})
	);
	const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, id) });
	expect(entry).toMatchObject({ type: 'TRANSACTION', refNo: 'INV-2026-0001', invoiceId: invoice.id, purchaseOrderId: null, advanceReceiptId: null });
	expect(await db.select().from(journalLines).where(eq(journalLines.journalId, id))).toHaveLength(2);
});

test('postJournal rejects unbalanced lines, same error as the existing journal path', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await expect(
		db.transaction((tx) => postJournal(tx, { companyId, createdBy: u.id, entryDate: '2026-10-01', description: 'x', refNo: 'x', lines: [{ accountId: bankAccountId, debit: '100.00', credit: '0.00' }] }))
	).rejects.toMatchObject({ code: 'unbalanced' });
});

test('reverseJournalEntries creates a swapped-sign entry per original, same refNo, linked to the same invoice', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const revenue = await accountIdByCode(companyId, '4-1001');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const [invoice] = await db.insert(invoices).values({ companyId, contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: bankAccountId, subtotal: '0', total: '0' }).returning();
	await db.transaction((tx) =>
		postJournal(tx, { companyId, createdBy: u.id, entryDate: '2026-10-01', description: 'x', refNo: 'INV-2026-0001', lines: [{ accountId: bankAccountId, debit: '100000.00', credit: '0.00' }, { accountId: revenue, debit: '0.00', credit: '100000.00' }], invoiceId: invoice.id })
	);
	await db.transaction((tx) => reverseJournalEntries(tx, { companyId, createdBy: u.id, invoiceId: invoice.id, descriptionPrefix: 'Pembalikan' }));

	const entries = await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, invoice.id));
	expect(entries).toHaveLength(2);
	const reversal = entries.find((e) => e.description?.startsWith('Pembalikan'))!;
	expect(reversal.refNo).toBe('INV-2026-0001');
	const lines = await db.select().from(journalLines).where(eq(journalLines.journalId, reversal.id));
	expect(lines).toEqual(expect.arrayContaining([
		expect.objectContaining({ accountId: bankAccountId, debit: '0.00', credit: '100000.00' }),
		expect.objectContaining({ accountId: revenue, debit: '100000.00', credit: '0.00' })
	]));
});

test('reverseJournalEntries ANDs every back-link id passed, not just the first one', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const revenue = await accountIdByCode(companyId, '4-1001');
	const deferredRevenue = await accountIdByCode(companyId, '2-1007');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const [invoice] = await db.insert(invoices).values({ companyId, contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: bankAccountId, subtotal: '0', total: '0' }).returning();
	const [advance] = await db
		.insert(advanceReceipts)
		.values({ companyId, contactId: contact.id, receiptNo: 'UM-2026-0001', receiptDate: '2026-10-01', amount: '0', deferredRevenueAccountId: deferredRevenue })
		.returning();

	// Entry A: linked to the invoice only.
	const { id: entryAId } = await db.transaction((tx) =>
		postJournal(tx, {
			companyId, createdBy: u.id, entryDate: '2026-10-01', description: 'A', refNo: 'A',
			lines: [{ accountId: bankAccountId, debit: '1000.00', credit: '0.00' }, { accountId: revenue, debit: '0.00', credit: '1000.00' }],
			invoiceId: invoice.id
		})
	);
	// Entry B: linked to BOTH the same invoice AND the advance receipt.
	const { id: entryBId } = await db.transaction((tx) =>
		postJournal(tx, {
			companyId, createdBy: u.id, entryDate: '2026-10-01', description: 'B', refNo: 'B',
			lines: [{ accountId: bankAccountId, debit: '2000.00', credit: '0.00' }, { accountId: revenue, debit: '0.00', credit: '2000.00' }],
			invoiceId: invoice.id, advanceReceiptId: advance.id
		})
	);

	await db.transaction((tx) => reverseJournalEntries(tx, { companyId, createdBy: u.id, invoiceId: invoice.id, advanceReceiptId: advance.id, descriptionPrefix: 'Pembalikan' }));

	const entries = await db.select().from(journalEntries).where(eq(journalEntries.invoiceId, invoice.id));
	// Entry A (invoiceId only) must NOT be reversed; entry B (both ids) must be reversed exactly once.
	expect(entries).toHaveLength(3);
	expect(entries.filter((e) => e.id === entryAId)).toHaveLength(1);
	expect(entries.filter((e) => e.id === entryBId)).toHaveLength(1);
	const reversal = entries.find((e) => e.description?.startsWith('Pembalikan'))!;
	expect(reversal.refNo).toBe('B');
	expect(reversal.advanceReceiptId).toBe(advance.id);
});

test('reverseJournalEntries throws a programmer error when no back-link id is passed', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await expect(
		db.transaction((tx) => reverseJournalEntries(tx, { companyId, createdBy: u.id, descriptionPrefix: 'Pembalikan' }))
	).rejects.toThrow('reverseJournalEntries requires at least one of invoiceId, purchaseOrderId, or advanceReceiptId');
});
