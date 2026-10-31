import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createContact } from '../../src/lib/server/invoicing/contacts';
import { createInvoice } from '../../src/lib/server/invoicing/invoices';
import { isUniqueViolation } from '../../src/lib/server/db/errors';
import { db } from '../../src/lib/server/db';
import { arApEntries, arApTerms, purchaseOrders } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id: contactId } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Pelanggan', code: 'PLG' });
	const { id: invoiceId } = await createInvoice(companyId, u.id, {
		contactId,
		issueDate: '2026-10-01',
		lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000000' }]
	});
	const [entry] = await db
		.insert(arApEntries)
		.values({ companyId, kind: 'AR', contactId, title: 'Piutang', total: '1000000.00', createdBy: u.id })
		.returning();
	return { companyId, contactId, invoiceId, entryId: entry.id, userId: u.id };
}
/** Kode SQLSTATE dan nama constraint dari rantai `cause` (dibaca seperti `isUniqueViolation`). */
function violatedConstraint(e: unknown): { code: unknown; constraint: unknown } | null {
	let cur: unknown = e;
	for (let depth = 0; cur && depth < 5; depth++) {
		if (typeof cur === 'object' && 'constraint_name' in cur) {
			return { code: (cur as { code?: unknown }).code, constraint: (cur as { constraint_name: unknown }).constraint_name };
		}
		cur = typeof cur === 'object' && 'cause' in cur ? (cur as { cause: unknown }).cause : null;
	}
	return null;
}
const term = (entryId: string, termNo: number, extra: Partial<typeof arApTerms.$inferInsert> = {}) => ({
	entryId,
	termNo,
	percent: '50.00',
	amount: '500000.00',
	...extra
});

test('two terms cannot link the same invoice', async () => {
	const { entryId, invoiceId } = await setup();
	await db.insert(arApTerms).values(term(entryId, 1, { invoiceId }));
	let err: unknown;
	try {
		await db.insert(arApTerms).values(term(entryId, 2, { invoiceId }));
	} catch (e) {
		err = e;
	}
	expect(isUniqueViolation(err, 'ar_ap_terms_invoice_uq')).toBe(true);
});

test('a term cannot link both an invoice and a purchase order', async () => {
	const { entryId, invoiceId, companyId, contactId } = await setup();
	const [po] = await db
		.insert(purchaseOrders)
		.values({ companyId, contactId, poNo: 'PO-1', issueDate: '2026-10-01', subtotal: '1.00', total: '1.00' })
		.returning();
	let err: unknown;
	try {
		await db.insert(arApTerms).values(term(entryId, 1, { invoiceId, purchaseOrderId: po.id }));
	} catch (e) {
		err = e;
	}
	expect(violatedConstraint(err)).toEqual({ code: '23514', constraint: 'ar_ap_terms_one_doc_ck' });
	expect(isUniqueViolation(err)).toBe(false);
});

test('deleting an entry cascades to its terms', async () => {
	const { entryId } = await setup();
	await db.insert(arApTerms).values([term(entryId, 1), term(entryId, 2)]);
	await db.delete(arApEntries).where(eq(arApEntries.id, entryId));
	expect(await db.select().from(arApTerms).where(eq(arApTerms.entryId, entryId))).toHaveLength(0);
});
