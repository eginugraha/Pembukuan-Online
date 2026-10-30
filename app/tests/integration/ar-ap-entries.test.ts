import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
	createArAp,
	deleteArAp,
	getArAp,
	linkDocumentToTerm,
	listArAp,
	listLinkableDocuments,
	setTermPaid,
	updateArAp,
	type CreateArApInput
} from '../../src/lib/server/arap/entries';
import { createInvoice, deleteInvoice, getInvoice } from '../../src/lib/server/invoicing/invoices';
import { createPurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { db } from '../../src/lib/server/db';
import { arApTerms } from '../../src/lib/server/db/schema';
import { makeCompany, makeContact, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id: customerId } = await makeContact(companyId, 'CUSTOMER', { name: 'PT Pelanggan', code: 'PLG' });
	const { id: vendorId } = await makeContact(companyId, 'VENDOR', { name: 'PT Pemasok', code: 'PMS' });
	return { companyId, userId: u.id, customerId, vendorId };
}

const docLines = [{ description: 'Jasa', quantity: '1', unitPrice: '1000000' }];
const makeInvoice = (companyId: string, userId: string, contactId: string, currency?: 'IDR' | 'USD') =>
	createInvoice(companyId, userId, { contactId, issueDate: '2026-10-01', currency, lines: docLines });
const makePO = (companyId: string, userId: string, contactId: string) =>
	createPurchaseOrder(companyId, userId, { contactId, issueDate: '2026-10-01', lines: docLines });

function input(contactId: string, overrides: Partial<CreateArApInput> = {}): CreateArApInput {
	return { kind: 'AR', contactId, title: 'Proyek A', total: '100000000', currency: 'IDR', paid: false, documentId: null, terms: [], ...overrides };
}
const threeTerms = (paid: [boolean, boolean, boolean] = [true, false, false], docs: (string | null)[] = [null, null, null]) => [
	{ name: 'DP', percent: '30', paid: paid[0], documentId: docs[0] },
	{ name: 'Termin 2', percent: '40', paid: paid[1], documentId: docs[1] },
	{ name: 'Pelunasan', percent: '30', paid: paid[2], documentId: docs[2] }
];

test('create AR with 3 terms 30/40/30 and paid DP is PARTIAL with computed amounts', async () => {
	const { companyId, userId, customerId } = await setup();
	const { id } = await createArAp(companyId, userId, input(customerId, { terms: threeTerms() }));
	const entry = await getArAp(companyId, id);
	expect(entry).toMatchObject({ kind: 'AR', hasTerms: true, status: 'PARTIAL', paidAmount: '30000000.00', remainingAmount: '70000000.00', termCount: 3, contactName: 'PT Pelanggan' });
	expect(entry.terms.map((t) => t.termNo)).toEqual([1, 2, 3]);
	expect(entry.terms.map((t) => t.amount)).toEqual(['30000000.00', '40000000.00', '30000000.00']);
});

test('create without terms stores one implicit term carrying paid and the document link', async () => {
	const { companyId, userId, customerId } = await setup();
	const inv = await makeInvoice(companyId, userId, customerId);
	const invoiceNo = (await getInvoice(companyId, inv.id)).invoiceNo;
	const { id } = await createArAp(companyId, userId, input(customerId, { paid: false, documentId: inv.id }));
	const rows = await db.select().from(arApTerms).where(eq(arApTerms.entryId, id));
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({ name: null, percent: '100.00', amount: '100000000.00', paid: false, invoiceId: inv.id });
	const [row] = await listArAp(companyId, 'AR');
	expect(row).toMatchObject({ id, hasTerms: false, singleDocumentNo: invoiceNo, documentCount: 1, termCount: 1, status: 'UNPAID' });
	expect((await getArAp(companyId, id)).hasTerms).toBe(false);
});

test('invalid term amounts are a 400 on the terms field', async () => {
	const { companyId, userId, customerId } = await setup();
	const terms = [
		{ name: 'A', amount: '10', paid: false },
		{ name: 'B', amount: '20', paid: false }
	];
	await expect(createArAp(companyId, userId, input(customerId, { terms }))).rejects.toMatchObject({ status: 400, code: 'validation_error', field: 'terms' });
});

test('contact kinds: VENDOR rejected for AR, BOTH accepted for AR and AP; wrong document kind rejected', async () => {
	const { companyId, userId, customerId, vendorId } = await setup();
	const { id: both } = await makeContact(companyId, 'BOTH', { name: 'PT Dua', code: 'DUA' });
	await expect(createArAp(companyId, userId, input(vendorId))).rejects.toMatchObject({ code: 'wrong_contact_kind' });
	await expect(createArAp(companyId, userId, input(customerId, { kind: 'AP' }))).rejects.toMatchObject({ code: 'wrong_contact_kind' });
	await createArAp(companyId, userId, input(both, { kind: 'AR' }));
	await createArAp(companyId, userId, input(both, { kind: 'AP' }));

	const inv = await makeInvoice(companyId, userId, customerId);
	const po = await makePO(companyId, userId, vendorId);
	await expect(createArAp(companyId, userId, input(vendorId, { kind: 'AP', documentId: inv.id }))).rejects.toMatchObject({ status: 400 });
	await expect(createArAp(companyId, userId, input(customerId, { kind: 'AR', documentId: po.id }))).rejects.toMatchObject({ status: 400 });
	const ap = await createArAp(companyId, userId, input(vendorId, { kind: 'AP', documentId: po.id }));
	expect((await getArAp(companyId, ap.id)).terms[0].document?.id).toBe(po.id);
});

test('two AR entries cannot use the same invoice, also when created concurrently', async () => {
	const { companyId, userId, customerId } = await setup();
	const inv = await makeInvoice(companyId, userId, customerId);
	await createArAp(companyId, userId, input(customerId, { documentId: inv.id }));
	await expect(createArAp(companyId, userId, input(customerId, { documentId: inv.id }))).rejects.toMatchObject({ status: 409, code: 'document_already_linked' });

	const inv2 = await makeInvoice(companyId, userId, customerId);
	const results = await Promise.allSettled([
		createArAp(companyId, userId, input(customerId, { documentId: inv2.id })),
		createArAp(companyId, userId, input(customerId, { documentId: inv2.id }))
	]);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	const rejected = results.filter((r) => r.status === 'rejected');
	expect(rejected).toHaveLength(1);
	expect(rejected[0].reason).toMatchObject({ status: 409, code: 'document_already_linked' });
});

test('soft-deleted invoice reads as no document, is not linkable, and its stale link can be overwritten', async () => {
	const { companyId, userId, customerId } = await setup();
	const inv = await makeInvoice(companyId, userId, customerId);
	const inv2 = await makeInvoice(companyId, userId, customerId);
	const { id } = await createArAp(companyId, userId, input(customerId, { documentId: inv.id }));
	await deleteInvoice(companyId, inv.id);

	const entry = await getArAp(companyId, id);
	expect(entry.terms[0].document).toBeNull();
	expect((await listArAp(companyId, 'AR'))[0]).toMatchObject({ documentCount: 0, singleDocumentNo: null });
	expect((await listLinkableDocuments(companyId, 'AR')).map((d) => d.id)).toEqual([inv2.id]);

	await db.transaction((tx) => linkDocumentToTerm(tx, companyId, entry.terms[0].id, inv2.id));
	expect((await getArAp(companyId, id)).terms[0].document?.id).toBe(inv2.id);
	expect(await listLinkableDocuments(companyId, 'AR')).toEqual([]);
	expect((await listLinkableDocuments(companyId, 'AR', { includeTermId: entry.terms[0].id })).map((d) => d.id)).toEqual([inv2.id]);
});

test('linkDocumentToTerm: 409 when the term has an active document or the document is taken; 404 across companies', async () => {
	const { companyId, userId, customerId } = await setup();
	const inv = await makeInvoice(companyId, userId, customerId);
	const inv2 = await makeInvoice(companyId, userId, customerId);
	const a = await createArAp(companyId, userId, input(customerId, { documentId: inv.id }));
	const b = await createArAp(companyId, userId, input(customerId));
	const termA = (await getArAp(companyId, a.id)).terms[0].id;
	const termB = (await getArAp(companyId, b.id)).terms[0].id;
	await expect(db.transaction((tx) => linkDocumentToTerm(tx, companyId, termA, inv2.id))).rejects.toMatchObject({ status: 409, code: 'term_already_linked' });
	await expect(db.transaction((tx) => linkDocumentToTerm(tx, companyId, termB, inv.id))).rejects.toMatchObject({ status: 409, code: 'document_already_linked' });

	const other = await makeCompany('PT Lain');
	const { id: otherCustomer } = await makeContact(other.companyId, 'CUSTOMER', { code: 'LAN' });
	const otherInv = await makeInvoice(other.companyId, userId, otherCustomer);
	await expect(db.transaction((tx) => linkDocumentToTerm(tx, other.companyId, termB, otherInv.id))).rejects.toMatchObject({ status: 404 });
	await expect(db.transaction((tx) => linkDocumentToTerm(tx, companyId, termB, otherInv.id))).rejects.toMatchObject({ status: 404 });
});

test('currencyMismatch is set when a USD AR links an IDR invoice; create still succeeds', async () => {
	const { companyId, userId, customerId } = await setup();
	const inv = await makeInvoice(companyId, userId, customerId, 'IDR');
	const { id } = await createArAp(companyId, userId, input(customerId, { currency: 'USD', documentId: inv.id }));
	const entry = await getArAp(companyId, id);
	expect(entry.currencyMismatch).toBe(true);
	expect(entry.terms[0].currencyMismatch).toBe(true);
	expect((await listArAp(companyId, 'AR'))[0].currencyMismatch).toBe(true);

	const inv2 = await makeInvoice(companyId, userId, customerId, 'IDR');
	const same = await createArAp(companyId, userId, input(customerId, { currency: 'IDR', documentId: inv2.id }));
	expect((await getArAp(companyId, same.id)).currencyMismatch).toBe(false);
});

test('updateArAp switches between terms and no terms, keeps sent links, and rejects a different kind', async () => {
	const { companyId, userId, customerId } = await setup();
	const { id } = await createArAp(companyId, userId, input(customerId, { terms: threeTerms([true, false, false]) }));

	// Bertermin -> tanpa termin dengan hanya DP lunas: `paid:true` dari klien diabaikan.
	await updateArAp(companyId, id, input(customerId, { terms: [], paid: true }));
	let entry = await getArAp(companyId, id);
	expect(entry).toMatchObject({ hasTerms: false, status: 'UNPAID', termCount: 1 });

	// Tanpa termin -> tanpa termin: `paid` dari klien dipakai.
	await updateArAp(companyId, id, input(customerId, { terms: [], paid: true }));
	expect((await getArAp(companyId, id)).status).toBe('PAID');

	const inv = await makeInvoice(companyId, userId, customerId);
	await updateArAp(companyId, id, input(customerId, { title: 'Proyek B', terms: threeTerms([false, false, false], [inv.id, null, null]) }));
	entry = await getArAp(companyId, id);
	expect(entry).toMatchObject({ title: 'Proyek B', hasTerms: true, status: 'UNPAID', termCount: 3 });
	expect(entry.terms[0].document?.id).toBe(inv.id);
	expect(entry.terms[1].document).toBeNull();

	// Tautan yang sama boleh dikirim ulang (termin lama dihapus dulu dalam transaksi yang sama).
	await updateArAp(companyId, id, input(customerId, { terms: threeTerms([true, false, false], [inv.id, null, null]) }));
	expect((await getArAp(companyId, id)).terms[0].document?.id).toBe(inv.id);

	await expect(updateArAp(companyId, id, input(customerId, { kind: 'AP' }))).rejects.toMatchObject({ status: 400 });
});

test('switching a fully paid termed entry to no terms stays PAID even if the client sends paid:false', async () => {
	const { companyId, userId, customerId } = await setup();
	const { id } = await createArAp(companyId, userId, input(customerId, { terms: threeTerms([true, true, true]) }));
	await updateArAp(companyId, id, input(customerId, { terms: [], paid: false }));
	expect(await getArAp(companyId, id)).toMatchObject({ hasTerms: false, status: 'PAID', termCount: 1 });
});

test('setTermPaid toggles paid and status follows; foreign terms give 404', async () => {
	const { companyId, userId, customerId } = await setup();
	const { id } = await createArAp(companyId, userId, input(customerId, { terms: threeTerms([false, false, false]) }));
	const terms = (await getArAp(companyId, id)).terms;
	await setTermPaid(companyId, id, terms[0].id, true);
	expect((await getArAp(companyId, id)).status).toBe('PARTIAL');
	await setTermPaid(companyId, id, terms[1].id, true);
	await setTermPaid(companyId, id, terms[2].id, true);
	expect((await getArAp(companyId, id)).status).toBe('PAID');
	await setTermPaid(companyId, id, terms[2].id, false);
	expect((await getArAp(companyId, id))).toMatchObject({ status: 'PARTIAL', remainingAmount: '30000000.00' });
	await setTermPaid(companyId, id, terms[0].id, false);
	await setTermPaid(companyId, id, terms[1].id, false);
	expect((await getArAp(companyId, id)).status).toBe('UNPAID');

	const otherEntry = await createArAp(companyId, userId, input(customerId));
	await expect(setTermPaid(companyId, otherEntry.id, terms[0].id, true)).rejects.toMatchObject({ status: 404 });
	const other = await makeCompany('PT Lain');
	await expect(setTermPaid(other.companyId, id, terms[0].id, true)).rejects.toMatchObject({ status: 404 });
});

test('deleteArAp clears links so the invoice can be reused; invoice survives; repeat delete is 404', async () => {
	const { companyId, userId, customerId } = await setup();
	const inv = await makeInvoice(companyId, userId, customerId);
	const { id } = await createArAp(companyId, userId, input(customerId, { documentId: inv.id }));
	await deleteArAp(companyId, id);
	expect(await listArAp(companyId, 'AR')).toEqual([]);
	await expect(getArAp(companyId, id)).rejects.toMatchObject({ status: 404 });
	expect((await listLinkableDocuments(companyId, 'AR')).map((d) => d.id)).toEqual([inv.id]);
	await createArAp(companyId, userId, input(customerId, { documentId: inv.id }));
	expect((await getInvoice(companyId, inv.id)).id).toBe(inv.id);
	await expect(deleteArAp(companyId, id)).rejects.toMatchObject({ status: 404 });
});

test('another company cannot get, update, delete, or set paid; foreign contactId is rejected', async () => {
	const { companyId, userId, customerId } = await setup();
	const { id } = await createArAp(companyId, userId, input(customerId));
	const termId = (await getArAp(companyId, id)).terms[0].id;
	const other = await makeCompany('PT Lain');
	await expect(getArAp(other.companyId, id)).rejects.toMatchObject({ status: 404 });
	await expect(updateArAp(other.companyId, id, input(customerId))).rejects.toMatchObject({ status: 404 });
	await expect(deleteArAp(other.companyId, id)).rejects.toMatchObject({ status: 404 });
	await expect(setTermPaid(other.companyId, id, termId, true)).rejects.toMatchObject({ status: 404 });
	await expect(createArAp(other.companyId, userId, input(customerId))).rejects.toMatchObject({ status: 404 });
	expect(await listArAp(other.companyId, 'AR')).toEqual([]);
	expect((await getArAp(companyId, id)).terms[0].paid).toBe(false);
});
