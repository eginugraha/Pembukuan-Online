import { beforeEach, expect, test } from 'bun:test';
import { db } from '../../src/lib/server/db';
import { contacts } from '../../src/lib/server/db/schema';
import { createArAp } from '../../src/lib/server/arap/entries';
import { createInvoice } from '../../src/lib/server/invoicing/invoices';
import { createPurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { load as listLoad } from '../../src/routes/(app)/invoicing/ar-ap/+page.server';
import { load as newLoad } from '../../src/routes/(app)/invoicing/ar-ap/new/+page.server';
import { load as editLoad } from '../../src/routes/(app)/invoicing/ar-ap/[id]/edit/+page.server';
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
