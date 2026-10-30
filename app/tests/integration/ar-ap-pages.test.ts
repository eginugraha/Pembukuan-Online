import { beforeEach, expect, test } from 'bun:test';
import { db } from '../../src/lib/server/db';
import { contacts } from '../../src/lib/server/db/schema';
import { createArAp } from '../../src/lib/server/arap/entries';
import { load as listLoad } from '../../src/routes/(app)/invoicing/ar-ap/+page.server';
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
