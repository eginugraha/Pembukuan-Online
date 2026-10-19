import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { invoices, invoiceLines, contacts } from '../../src/lib/server/db/schema';
import { createInvoice, getInvoice } from '../../src/lib/server/invoicing/invoices';
import { makeCompany, makeUser, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('creates a Draft invoice with no number and no journal, with subtotal/tax/total computed server-side', async () => {
	const { companyId } = await makeCompany();
	const user = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const tax = await accountIdByCode(companyId, '2-1005');

	const { id } = await createInvoice(companyId, user.id, {
		contactId: contact.id,
		issueDate: '2026-10-01',
		receivableAccountId: receivable,
		taxRate: '11',
		taxAccountId: tax,
		lines: [{ description: 'Jasa konsultasi', quantity: '2', unitPrice: '500000', revenueAccountId: revenue }]
	});
	const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
	expect(invoice).toMatchObject({ status: 'DRAFT', invoiceNo: null, subtotal: '1000000.00', taxAmount: '110000.00', total: '1110000.00' });
	const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
	expect(lines[0]).toMatchObject({ amount: '1000000.00' });

	const detail = await getInvoice(companyId, id);
	expect(detail.status).toBe('DRAFT');
});

test('rejects a revenue account that is not actually a REVENUE-type account', async () => {
	const { companyId } = await makeCompany();
	const user = await makeUser();
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT X' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const expenseAccount = await accountIdByCode(companyId, '5-2010');
	await expect(
		createInvoice(companyId, user.id, {
			contactId: contact.id,
			issueDate: '2026-10-01',
			receivableAccountId: receivable,
			lines: [{ description: 'x', quantity: '1', unitPrice: '1000', revenueAccountId: expenseAccount }]
		})
	).rejects.toMatchObject({ code: 'wrong_account_type' });
});
