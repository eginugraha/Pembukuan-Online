import { beforeEach, expect, test } from 'bun:test';
import { db } from '../../src/lib/server/db';
import { toSnapshot } from '../../src/lib/arap-terms';
import { contacts } from '../../src/lib/server/db/schema';
import { createArAp, deleteArAp, getArAp } from '../../src/lib/server/arap/entries';
import { createInvoice, deleteInvoice } from '../../src/lib/server/invoicing/invoices';
import { createPurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { load as listLoad } from '../../src/routes/(app)/invoicing/ar-ap/+page.server';
import { load as newLoad } from '../../src/routes/(app)/invoicing/ar-ap/new/+page.server';
import { load as editLoad } from '../../src/routes/(app)/invoicing/ar-ap/[id]/edit/+page.server';
import { load as detailLoad } from '../../src/routes/(app)/invoicing/ar-ap/[id]/+page.server';
import { load as invoiceNewLoad } from '../../src/routes/(app)/invoicing/invoices/new/+page.server';
import { load as poNewLoad } from '../../src/routes/(app)/invoicing/purchase-orders/new/+page.server';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId } = await makeCompany();
	const acc = await makeUser();
	await addMember(acc.id, companyId, 'accountant');
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Pelanggan Uji', code: 'PLG' }).returning();
	const [supplier] = await db.insert(contacts).values({ companyId, kind: 'VENDOR', name: 'PT Pemasok Uji', code: 'PMS' }).returning();
	const mk = (kind: 'AR' | 'AP', title: string) =>
		createArAp(companyId, acc.id, { kind, contactId: kind === 'AR' ? contact.id : supplier.id, title, total: '1000000', currency: 'IDR', paid: false, terms: [] } as never);
	const run = async (who: typeof acc, path: string) => {
		const event = fakeEvent({ ctx: await contextFor(who, companyId), path });
		return (await listLoad(event as never)) as unknown as {
			tab: string;
			entries: { title: string; kind: string }[];
			summary: { ar: Record<string, string>; ap: Record<string, string>; net: Record<string, string> };
			canWrite: boolean;
		};
	};
	return { acc, viewer, mk, run };
}

test('list loader: tab=ap loads only AP entries, default and invalid tab fall back to ar', async () => {
	const { acc, mk, run } = await setup();
	await mk('AR', 'Piutang A');
	await mk('AP', 'Hutang B');
	const ap = await run(acc, '/invoicing/ar-ap?tab=ap');
	expect([ap.tab, ap.entries.map((e) => e.title)]).toEqual(['ap', ['Hutang B']]);
	for (const path of ['/invoicing/ar-ap', '/invoicing/ar-ap?tab=ngawur']) {
		const r = await run(acc, path);
		expect([r.tab, r.entries.map((e) => e.title)]).toEqual(['ar', ['Piutang A']]);
	}
});

test('list loader: canWrite is false for viewer, true for accountant; summary always returned', async () => {
	const { acc, viewer, mk, run } = await setup();
	await mk('AR', 'Piutang A');
	const v = await run(viewer, '/invoicing/ar-ap?tab=ap');
	const a = await run(acc, '/invoicing/ar-ap');
	expect([v.canWrite, a.canWrite]).toEqual([false, true]);
	expect(v.summary.ar.IDR).toBe('1000000.00');
	expect(a.summary.net).toBeDefined();
});

type FormData = { kind?: string; entry?: { id: string }; contacts: { id: string; name: string }[]; linkable: { id: string; no: string }[] };

async function formSetup() {
	const { companyId } = await makeCompany();
	const acc = await makeUser();
	await addMember(acc.id, companyId, 'accountant');
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const ins = (kind: 'CUSTOMER' | 'VENDOR' | 'BOTH', name: string, code: string) =>
		db.insert(contacts).values({ companyId, kind, name, code }).returning().then((r) => r[0]);
	const customer = await ins('CUSTOMER', 'A Pelanggan', 'PLG');
	const vendor = await ins('VENDOR', 'B Pemasok', 'PMS');
	const both = await ins('BOTH', 'C Keduanya', 'KDA');
	const lines = [{ description: 'Jasa', quantity: '1', unitPrice: '1000000' }];
	const inv = () => createInvoice(companyId, acc.id, { contactId: customer.id, issueDate: '2026-10-01', lines });
	const po = () => createPurchaseOrder(companyId, acc.id, { contactId: vendor.id, issueDate: '2026-10-01', lines });
	const base = { title: 'Uji', total: '1000000', currency: 'IDR', paid: false, documentId: null, terms: [] };
	const runNew = async (who: typeof acc, path: string) =>
		(await newLoad(fakeEvent({ ctx: await contextFor(who, companyId), path }) as never)) as unknown as FormData;
	const runEdit = async (who: typeof acc, id: string) =>
		(await editLoad(fakeEvent({ ctx: await contextFor(who, companyId), path: `/invoicing/ar-ap/${id}/edit`, params: { id } }) as never)) as unknown as FormData;
	return { companyId, acc, viewer, customer, vendor, both, inv, po, base, runNew, runEdit };
}

test('new loader: kind=AP offers VENDOR/BOTH contacts and only unlinked POs', async () => {
	const s = await formSetup();
	const linked = await s.po();
	const free = await s.po();
	await createArAp(s.companyId, s.acc.id, { ...s.base, kind: 'AP', contactId: s.vendor.id, documentId: linked.id } as never);
	const r = await s.runNew(s.acc, '/invoicing/ar-ap/new?kind=AP');
	expect(r.kind).toBe('AP');
	expect(r.contacts.map((c) => c.id)).toEqual([s.vendor.id, s.both.id]);
	expect(r.linkable.map((d) => d.id)).toEqual([free.id]);
});

test('new loader: kind=AR (and nonsense or missing kind) offers CUSTOMER/BOTH contacts and invoices', async () => {
	const s = await formSetup();
	const inv = await s.inv();
	await s.po();
	for (const path of ['/invoicing/ar-ap/new?kind=AR', '/invoicing/ar-ap/new?kind=ngawur', '/invoicing/ar-ap/new']) {
		const r = await s.runNew(s.acc, path);
		expect(r.kind).toBe('AR');
		expect(r.contacts.map((c) => c.id)).toEqual([s.customer.id, s.both.id]);
		expect(r.linkable.map((d) => d.id)).toEqual([inv.id]);
	}
});

test('edit loader: lists documents linked to any term of this entry, excludes documents of other entries', async () => {
	const s = await formSetup();
	const [a, b, other, free] = [await s.inv(), await s.inv(), await s.inv(), await s.inv()];
	const terms = [
		{ name: 'DP', percent: '50', paid: false, documentId: a.id },
		{ name: 'Lunas', percent: '50', paid: false, documentId: b.id }
	];
	const { id } = await createArAp(s.companyId, s.acc.id, { ...s.base, kind: 'AR', contactId: s.customer.id, terms } as never);
	await createArAp(s.companyId, s.acc.id, { ...s.base, kind: 'AR', contactId: s.customer.id, documentId: other.id } as never);
	const r = await s.runEdit(s.acc, id);
	expect(r.entry!.id).toBe(id);
	expect(r.contacts.map((c) => c.id)).toEqual([s.customer.id, s.both.id]);
	expect(r.linkable.map((d) => d.id).sort()).toEqual([a.id, b.id, free.id].sort());
});

test('edit loader: the form snapshot built from the loaded entry matches its terms (effective documents)', async () => {
	const s = await formSetup();
	const [a, b] = [await s.inv(), await s.inv()];
	const terms = [
		{ name: 'DP', percent: '50', paid: true, documentId: a.id },
		{ name: 'Lunas', percent: '50', paid: false, documentId: b.id }
	];
	const { id } = await createArAp(s.companyId, s.acc.id, { ...s.base, kind: 'AR', contactId: s.customer.id, terms } as never);
	await deleteInvoice(s.companyId, b.id);
	const r = (await s.runEdit(s.acc, id)) as unknown as { entry: { terms: Parameters<typeof toSnapshot>[0] } };
	const dbTerms = (await getArAp(s.companyId, id)).terms;
	expect(toSnapshot(r.entry.terms)).toEqual([
		{ id: dbTerms[0].id, paid: true, documentId: a.id },
		{ id: dbTerms[1].id, paid: false, documentId: null }
	]);
});

test('edit loader: 404 for a missing entry', async () => {
	const s = await formSetup();
	await expect(s.runEdit(s.acc, crypto.randomUUID())).rejects.toMatchObject({ status: 404 });
});

test('viewer is rejected by new and edit loaders', async () => {
	const s = await formSetup();
	const { id } = await createArAp(s.companyId, s.acc.id, { ...s.base, kind: 'AR', contactId: s.customer.id } as never);
	await expect(s.runNew(s.viewer, '/invoicing/ar-ap/new')).rejects.toMatchObject({ status: 403 });
	await expect(s.runEdit(s.viewer, id)).rejects.toMatchObject({ status: 403 });
});

// --- Task 10: detail page and create-invoice/PO shortcuts ---

// SvelteKit HttpError (punya body), bukan ApiError mentah yang di halaman akan jadi 500.
const PAGE_404 = { status: 404, body: { message: 'Termin tidak ditemukan' } };
type Prefill = { contactId: string; currency: string; title: string; amount: string; entryId: string; kind: string; linked: boolean };
type NewDocData = { contacts: { id: string }[]; prefill: Prefill | null; termId: string | null };

async function termSetup() {
	const s = await formSetup();
	const terms = [
		{ name: 'DP', percent: '30', paid: false, documentId: null },
		{ name: 'Pelunasan', percent: '70', paid: false, documentId: null }
	];
	const ar = await createArAp(s.companyId, s.acc.id, { ...s.base, kind: 'AR', title: 'Proyek A', currency: 'USD', contactId: s.customer.id, terms } as never);
	const ap = await createArAp(s.companyId, s.acc.id, { ...s.base, kind: 'AP', title: 'Beli B', contactId: s.vendor.id, terms: [] } as never);
	const arTerms = (await getArAp(s.companyId, ar.id)).terms;
	const apTerms = (await getArAp(s.companyId, ap.id)).terms;
	const ev = async (who: typeof s.acc, path: string, companyId = s.companyId) => fakeEvent({ ctx: await contextFor(who, companyId), path }) as never;
	const runInv = async (who: typeof s.acc, path: string) => (await invoiceNewLoad(await ev(who, path))) as unknown as NewDocData;
	const runPo = async (who: typeof s.acc, path: string) => (await poNewLoad(await ev(who, path))) as unknown as NewDocData;
	const runDetail = async (who: typeof s.acc, id: string) =>
		(await detailLoad(fakeEvent({ ctx: await contextFor(who, s.companyId), path: `/invoicing/ar-ap/${id}`, params: { id } }) as never)) as unknown as {
			entry: { id: string; terms: { id: string; document: { id: string } | null }[] };
			canWrite: boolean;
		};
	return { ...s, ar, ap, arTerms, apTerms, runInv, runPo, runDetail };
}

test('detail loader: returns entry with terms and linked document; canWrite by role', async () => {
	const s = await termSetup();
	const inv = await createInvoice(s.companyId, s.acc.id, { contactId: s.customer.id, issueDate: '2026-10-01', lines: [{ description: 'DP', quantity: '1', unitPrice: '300' }] }, { linkTermId: s.arTerms[0].id });
	const a = await s.runDetail(s.acc, s.ar.id);
	const v = await s.runDetail(s.viewer, s.ar.id);
	expect(a.entry.id).toBe(s.ar.id);
	expect(a.entry.terms.map((t) => t.document?.id ?? null)).toEqual([inv.id, null]);
	expect([v.canWrite, a.canWrite]).toEqual([false, true]);
});

test('detail loader: 404 for missing or non-UUID id', async () => {
	const s = await termSetup();
	await expect(s.runDetail(s.acc, crypto.randomUUID())).rejects.toMatchObject({ status: 404, body: { message: expect.any(String) } });
	await expect(s.runDetail(s.acc, 'bukan-uuid')).rejects.toMatchObject({ status: 404, body: { message: expect.any(String) } });
});

test('invoices/new?termId=<AR term> returns prefill and termId; without termId prefill is null', async () => {
	const s = await termSetup();
	const t = s.arTerms[1];
	const r = await s.runInv(s.acc, `/invoicing/invoices/new?termId=${t.id}`);
	expect(r.termId).toBe(t.id);
	expect(r.prefill).toEqual({ contactId: s.customer.id, currency: 'USD', title: 'Proyek A', amount: t.amount, entryId: s.ar.id, kind: 'AR', linked: false });
	expect(r.prefill!.amount).toBe('700000.00');
	const plain = await s.runInv(s.acc, '/invoicing/invoices/new');
	expect([plain.prefill, plain.termId]).toEqual([null, null]);
	expect(plain.contacts.length).toBeGreaterThan(0);
});

test('purchase-orders/new?termId=<AP term> returns prefill', async () => {
	const s = await termSetup();
	const t = s.apTerms[0];
	const r = await s.runPo(s.acc, `/invoicing/purchase-orders/new?termId=${t.id}`);
	expect(r.termId).toBe(t.id);
	expect(r.prefill).toMatchObject({ contactId: s.vendor.id, currency: 'IDR', title: 'Beli B', amount: '1000000.00', entryId: s.ap.id, kind: 'AP' });
});

test('kind mismatch, other company, missing and non-UUID termId are 404', async () => {
	const s = await termSetup();
	await expect(s.runInv(s.acc, `/invoicing/invoices/new?termId=${s.apTerms[0].id}`)).rejects.toMatchObject(PAGE_404);
	await expect(s.runPo(s.acc, `/invoicing/purchase-orders/new?termId=${s.arTerms[0].id}`)).rejects.toMatchObject(PAGE_404);
	await expect(s.runInv(s.acc, `/invoicing/invoices/new?termId=${crypto.randomUUID()}`)).rejects.toMatchObject(PAGE_404);
	await expect(s.runInv(s.acc, '/invoicing/invoices/new?termId=bukan-uuid')).rejects.toMatchObject(PAGE_404);
	const other = await makeCompany();
	await addMember(s.acc.id, other.companyId, 'accountant');
	const ev = fakeEvent({ ctx: await contextFor(s.acc, other.companyId), path: `/invoicing/invoices/new?termId=${s.arTerms[0].id}` });
	await expect(invoiceNewLoad(ev as never)).rejects.toMatchObject(PAGE_404);
});

test('term of a deleted entry is 404', async () => {
	const s = await termSetup();
	await deleteArAp(s.companyId, s.ar.id);
	await expect(s.runInv(s.acc, `/invoicing/invoices/new?termId=${s.arTerms[0].id}`)).rejects.toMatchObject({ status: 404 });
});

test('term with an active linked document redirects to the AR/AP detail page', async () => {
	const s = await termSetup();
	await createInvoice(s.companyId, s.acc.id, { contactId: s.customer.id, issueDate: '2026-10-01', lines: [{ description: 'DP', quantity: '1', unitPrice: '300' }] }, { linkTermId: s.arTerms[0].id });
	await expect(s.runInv(s.acc, `/invoicing/invoices/new?termId=${s.arTerms[0].id}`)).rejects.toMatchObject({ status: 303, location: `/invoicing/ar-ap/${s.ar.id}` });
});

test('viewer cannot reach new-invoice prefill', async () => {
	const s = await termSetup();
	await expect(s.runInv(s.viewer, `/invoicing/invoices/new?termId=${s.arTerms[0].id}`)).rejects.toMatchObject({ status: 403 });
});
