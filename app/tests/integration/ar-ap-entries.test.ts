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
import { arApTerms, invoices } from '../../src/lib/server/db/schema';
import { toSnapshot } from '../../src/lib/arap-terms';
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

test('listLinkableDocuments includeEntryId keeps documents of all terms of that entry, still excludes other entries', async () => {
	const { companyId, userId, customerId } = await setup();
	const [inv1, inv2, inv3, free] = [
		await makeInvoice(companyId, userId, customerId),
		await makeInvoice(companyId, userId, customerId),
		await makeInvoice(companyId, userId, customerId),
		await makeInvoice(companyId, userId, customerId)
	];
	const x = await createArAp(companyId, userId, input(customerId, { terms: threeTerms([false, false, false], [inv1.id, inv2.id, null]) }));
	await createArAp(companyId, userId, input(customerId, { documentId: inv3.id }));
	const ids = async (opts?: { includeEntryId?: string }) => (await listLinkableDocuments(companyId, 'AR', opts)).map((d) => d.id).sort();
	expect(await ids()).toEqual([free.id]);
	expect(await ids({ includeEntryId: x.id })).toEqual([inv1.id, inv2.id, free.id].sort());
});

// --- Snapshot (form ubah basi) ---

const stale = { status: 409, code: 'stale_entry', message: 'Data sudah berubah oleh proses lain. Muat ulang halaman, lalu coba lagi.' };
const rawTerms = (entryId: string) => db.select().from(arApTerms).where(eq(arApTerms.entryId, entryId)).orderBy(arApTerms.termNo);

async function termedEntry() {
	const s = await setup();
	const { id } = await createArAp(s.companyId, s.userId, input(s.customerId, { terms: threeTerms([false, false, false]) }));
	return { ...s, id };
}

test('stale snapshot: a concurrent setTermPaid makes updateArAp 409 stale_entry and the DB is unchanged', async () => {
	const { companyId, customerId, id } = await termedEntry();
	const loaded = await getArAp(companyId, id);
	await setTermPaid(companyId, id, loaded.terms[0].id, true);
	await expect(
		updateArAp(companyId, id, { ...input(customerId, { title: 'Judul Baru', terms: threeTerms([false, false, false]) }), snapshot: toSnapshot(loaded.terms) })
	).rejects.toMatchObject(stale);
	const after = await getArAp(companyId, id);
	expect(after.title).toBe('Proyek A');
	expect(after.terms.map((t) => t.id)).toEqual(loaded.terms.map((t) => t.id));
	expect(after.terms.map((t) => t.paid)).toEqual([true, false, false]);
});

test('stale snapshot: a concurrent linkDocumentToTerm makes updateArAp 409 and the link stays', async () => {
	const { companyId, userId, customerId, id } = await termedEntry();
	const loaded = await getArAp(companyId, id);
	const inv = await makeInvoice(companyId, userId, customerId);
	await db.transaction((tx) => linkDocumentToTerm(tx, companyId, loaded.terms[1].id, inv.id));
	await expect(
		updateArAp(companyId, id, { ...input(customerId, { title: 'Judul Baru', terms: threeTerms([false, false, false]) }), snapshot: toSnapshot(loaded.terms) })
	).rejects.toMatchObject(stale);
	const rows = await rawTerms(id);
	expect(rows.map((r) => r.id)).toEqual(loaded.terms.map((t) => t.id));
	expect(rows[1].invoiceId).toBe(inv.id);
	expect((await getArAp(companyId, id)).title).toBe('Proyek A');
});

test('stale snapshot: added/removed terms and a changed effective document are detected', async () => {
	const { companyId, userId, customerId, id } = await termedEntry();
	const loaded = await getArAp(companyId, id);
	const body = (snapshot: ReturnType<typeof toSnapshot>) => ({ ...input(customerId, { terms: threeTerms([false, false, false]) }), snapshot });
	const snap = toSnapshot(loaded.terms);
	await expect(updateArAp(companyId, id, body(snap.slice(0, 2)))).rejects.toMatchObject(stale);
	await expect(updateArAp(companyId, id, body([...snap, { id: crypto.randomUUID(), paid: false, documentId: null }]))).rejects.toMatchObject(stale);
	await expect(updateArAp(companyId, id, body([snap[0], snap[0], snap[2]]))).rejects.toMatchObject(stale);
	const inv = await makeInvoice(companyId, userId, customerId);
	await expect(updateArAp(companyId, id, body([{ ...snap[0], documentId: inv.id }, snap[1], snap[2]]))).rejects.toMatchObject(stale);
	expect((await rawTerms(id)).map((r) => r.id)).toEqual(loaded.terms.map((t) => t.id));
});

test('current snapshot: update succeeds and a title-only edit preserves links and paid flags', async () => {
	const { companyId, userId, customerId } = await setup();
	const inv = await makeInvoice(companyId, userId, customerId);
	const { id } = await createArAp(companyId, userId, input(customerId, { terms: threeTerms([true, false, false], [null, inv.id, null]) }));
	const loaded = await getArAp(companyId, id);
	// Payload seperti form: termin dikirim ulang apa adanya dengan dokumen efektif masing-masing.
	const terms = loaded.terms.map((t) => ({ name: t.name!, percent: t.percent, paid: t.paid, documentId: t.document?.id ?? null }));
	await updateArAp(companyId, id, { ...input(customerId, { title: 'Proyek Baru', terms }), snapshot: toSnapshot(loaded.terms) });
	const after = await getArAp(companyId, id);
	expect(after.title).toBe('Proyek Baru');
	expect(after.terms.map((t) => t.paid)).toEqual([true, false, false]);
	expect(after.terms.map((t) => t.document?.id ?? null)).toEqual([null, inv.id, null]);
	expect((await rawTerms(id))[1].invoiceId).toBe(inv.id);

	// Snapshot baru (id termin baru) dari hasil ubah juga diterima.
	await updateArAp(companyId, id, { ...input(customerId, { title: 'Proyek Lagi', terms }), snapshot: toSnapshot(after.terms) });
	expect((await getArAp(companyId, id)).title).toBe('Proyek Lagi');
});

test('update without snapshot still succeeds (backwards compatible)', async () => {
	const { companyId, customerId, id } = await termedEntry();
	await setTermPaid(companyId, id, (await getArAp(companyId, id)).terms[0].id, true);
	await updateArAp(companyId, id, input(customerId, { title: 'Tanpa Snapshot', terms: threeTerms([false, true, false]) }));
	const after = await getArAp(companyId, id);
	expect(after.title).toBe('Tanpa Snapshot');
	expect(after.terms.map((t) => t.paid)).toEqual([false, true, false]);
});

test('soft-deleted linked invoice: snapshot carries documentId null (effective) and update succeeds', async () => {
	// Kolom invoice_id masih terisi setelah invoice dihapus (soft delete); getArAp membacanya sebagai tanpa dokumen,
	// jadi snapshot form berisi null. Perbandingan memakai dokumen efektif, bukan kolom mentah -> tidak 409.
	const { companyId, userId, customerId } = await setup();
	const inv = await makeInvoice(companyId, userId, customerId);
	const { id } = await createArAp(companyId, userId, input(customerId, { terms: threeTerms([false, false, false], [inv.id, null, null]) }));
	await deleteInvoice(companyId, inv.id);
	const loaded = await getArAp(companyId, id);
	const snapshot = toSnapshot(loaded.terms);
	expect(snapshot[0].documentId).toBeNull();
	expect((await rawTerms(id))[0].invoiceId).toBe(inv.id);
	await updateArAp(companyId, id, { ...input(customerId, { title: 'Setelah Hapus', terms: threeTerms([false, false, false]) }), snapshot });
	expect((await getArAp(companyId, id)).title).toBe('Setelah Hapus');
});

test('concurrency: createInvoice(linkTermId) racing updateArAp with the pre-link snapshot never loses the link', async () => {
	// Urutan antar-transaksi tidak bisa dipaksa di sini, jadi assertion berlaku untuk SETIAP urutan:
	// update 409 (link duluan) atau link 404 (update duluan, termin lama sudah diganti). Bila createInvoice
	// sukses, tautannya harus ada di DB akhir.
	for (let round = 0; round < 5; round++) {
		await resetDb();
		const { companyId, userId, customerId, id } = await termedEntry();
		const loaded = await getArAp(companyId, id);
		const terms = loaded.terms.map((t) => ({ name: t.name!, percent: t.percent, paid: t.paid, documentId: null }));
		const [created, updated] = await Promise.allSettled([
			createInvoice(companyId, userId, { contactId: customerId, issueDate: '2026-10-01', lines: docLines }, { linkTermId: loaded.terms[1].id }),
			updateArAp(companyId, id, { ...input(customerId, { title: 'Balapan', terms }), snapshot: toSnapshot(loaded.terms) })
		]);
		const final = await getArAp(companyId, id);
		if (created.status === 'fulfilled') {
			expect(final.terms.some((t) => t.document?.id === created.value.id)).toBe(true);
			expect(updated.status).toBe('rejected');
			expect((updated as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'stale_entry' });
		} else {
			expect(created.reason).toMatchObject({ status: 404 });
			expect(updated.status).toBe('fulfilled');
			expect(final.title).toBe('Balapan');
			expect(await db.select().from(invoices)).toHaveLength(0);
		}
	}
});

test('concurrency (forced interleave): updateArAp waits for an uncommitted link and then 409s', async () => {
	// Transaksi tautan ditahan terbuka setelah linkDocumentToTerm; updateArAp dimulai lalu harus menunggu kunci
	// entri/termin. Hasilnya deterministik: apa pun waktunya, update melihat tautan yang sudah commit -> 409.
	const { companyId, userId, customerId, id } = await termedEntry();
	const loaded = await getArAp(companyId, id);
	const inv = await makeInvoice(companyId, userId, customerId);
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	let linked!: () => void;
	const linkedP = new Promise<void>((r) => (linked = r));
	const linkTx = db.transaction(async (tx) => {
		await linkDocumentToTerm(tx, companyId, loaded.terms[1].id, inv.id);
		linked();
		await gate;
	});
	await linkedP;
	const upd = updateArAp(companyId, id, { ...input(customerId, { title: 'Basi', terms: threeTerms([false, false, false]) }), snapshot: toSnapshot(loaded.terms) }).then(
		() => 'ok',
		(e: unknown) => e
	);
	await Bun.sleep(150);
	release();
	await linkTx;
	expect(await upd).toMatchObject(stale);
	expect((await rawTerms(id))[1].invoiceId).toBe(inv.id);
});

test('createArAp rejects a document of another company with 400 invalid_document', async () => {
	const { companyId, userId, customerId } = await setup();
	const other = await makeCompany('PT Lain');
	const { id: otherCustomer } = await makeContact(other.companyId, 'CUSTOMER', { code: 'LAN' });
	const otherInv = await makeInvoice(other.companyId, userId, otherCustomer);
	await expect(createArAp(companyId, userId, input(customerId, { documentId: otherInv.id }))).rejects.toMatchObject({ status: 400, code: 'invalid_document' });
	await expect(createArAp(companyId, userId, input(customerId, { terms: threeTerms([false, false, false], [otherInv.id, null, null]) }))).rejects.toMatchObject({
		status: 400,
		code: 'invalid_document'
	});
	expect(await listArAp(companyId, 'AR')).toEqual([]);
});
