import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { journalEntries, journalLines, contacts, invoices } from '../../src/lib/server/db/schema';
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
