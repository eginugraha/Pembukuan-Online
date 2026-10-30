import { beforeEach, expect, test } from 'bun:test';
import { GET as LIST, POST } from '../../src/routes/api/invoicing/ar-ap/+server';
import { DELETE, GET, PUT } from '../../src/routes/api/invoicing/ar-ap/[id]/+server';
import { PATCH } from '../../src/routes/api/invoicing/ar-ap/[id]/terms/[termId]/+server';
import { db } from '../../src/lib/server/db';
import { contacts } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser, addMember, contextFor } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId } = await makeCompany();
	const acc = await makeUser();
	await addMember(acc.id, companyId, 'accountant');
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Pelanggan Uji', code: 'PLG' }).returning();
	const ev = async (
		who: typeof acc | null,
		method: string,
		o: { path?: string; params?: Record<string, string>; body?: unknown; cid?: string } = {}
	) =>
		fakeEvent({
			ctx: who ? await contextFor(who, o.cid ?? companyId) : null,
			method,
			path: o.path ?? '/api/invoicing/ar-ap',
			params: o.params,
			body: o.body
		});
	const body = (over: Record<string, unknown> = {}) => ({
		kind: 'AR',
		contactId: contact.id,
		title: 'Proyek Uji',
		total: '1000000',
		currency: 'IDR',
		paid: false,
		terms: [
			{ name: 'DP', percent: '50', paid: false },
			{ name: 'Pelunasan', percent: '50', paid: false }
		],
		...over
	});
	return { companyId, acc, viewer, contact, ev, body };
}

test('viewer can read but not write; unauthenticated gets 401', async () => {
	const { acc, viewer, ev, body } = await setup();
	const created = await call(POST, await ev(acc, 'POST', { body: body() }));
	expect(created.status).toBe(201);
	const id = created.body.id as string;
	const p = { path: `/api/invoicing/ar-ap/${id}`, params: { id } };

	const list = await call(LIST, await ev(viewer, 'GET', { path: '/api/invoicing/ar-ap?kind=AR' }));
	expect(list.status).toBe(200);
	expect(list.body.entries).toHaveLength(1);
	expect(list.body.summary).toBeDefined();
	expect((await call(GET, await ev(viewer, 'GET', p))).status).toBe(200);

	expect((await call(POST, await ev(viewer, 'POST', { body: body() }))).status).toBe(403);
	expect((await call(PUT, await ev(viewer, 'PUT', { ...p, body: body() }))).status).toBe(403);
	expect((await call(DELETE, await ev(viewer, 'DELETE', p))).status).toBe(403);
	const termId = (await call(GET, await ev(viewer, 'GET', p))).body.terms[0].id as string;
	const tp = { path: `${p.path}/terms/${termId}`, params: { id, termId }, body: { paid: true } };
	expect((await call(PATCH, await ev(viewer, 'PATCH', tp))).status).toBe(403);

	expect((await call(LIST, await ev(null, 'GET', { path: '/api/invoicing/ar-ap?kind=AR' }))).status).toBe(401);
	expect((await call(POST, await ev(null, 'POST', { body: body() }))).status).toBe(401);
});

test('accountant creates, PATCH paid changes status, PUT and DELETE work', async () => {
	const { acc, ev, body } = await setup();
	const created = await call(POST, await ev(acc, 'POST', { body: body() }));
	expect(created.status).toBe(201);
	const id = created.body.id as string;
	const p = { path: `/api/invoicing/ar-ap/${id}`, params: { id } };

	const before = await call(GET, await ev(acc, 'GET', p));
	expect(before.body.terms).toHaveLength(2);
	const termId = before.body.terms[0].id as string;
	const patched = await call(PATCH, await ev(acc, 'PATCH', { path: `${p.path}/terms/${termId}`, params: { id, termId }, body: { paid: true } }));
	expect(patched).toEqual({ status: 200, body: { ok: true } });
	const after = await call(GET, await ev(acc, 'GET', p));
	expect(after.body.terms[0].paid).toBe(true);
	expect(after.body).not.toEqual(before.body);

	const put = await call(PUT, await ev(acc, 'PUT', { ...p, body: body({ title: 'Judul Baru', terms: [] }) }));
	expect(put).toEqual({ status: 200, body: { ok: true } });
	expect((await call(GET, await ev(acc, 'GET', p))).body.title).toBe('Judul Baru');

	expect((await call(DELETE, await ev(acc, 'DELETE', p))).body).toEqual({ ok: true });
	expect((await call(GET, await ev(acc, 'GET', p))).status).toBe(404);
});

test('invalid body or kind gives 400 with error.fields', async () => {
	const { acc, ev, body } = await setup();
	const bad = await call(POST, await ev(acc, 'POST', { body: body({ title: '', total: '0' }) }));
	expect(bad.status).toBe(400);
	expect(bad.body.error.code).toBe('validation_error');
	expect(bad.body.error.fields).toBeDefined();

	const created = await call(POST, await ev(acc, 'POST', { body: body() }));
	const id = created.body.id as string;
	const termId = (await call(GET, await ev(acc, 'GET', { path: `/x/${id}`, params: { id } }))).body.terms[0].id as string;
	const badPatch = await call(PATCH, await ev(acc, 'PATCH', { params: { id, termId }, body: { paid: 'ya' } }));
	expect(badPatch.status).toBe(400);
	expect(badPatch.body.error.fields).toBeDefined();

	for (const path of ['/api/invoicing/ar-ap', '/api/invoicing/ar-ap?kind=XX']) {
		const r = await call(LIST, await ev(acc, 'GET', { path }));
		expect(r.status).toBe(400);
		expect(r.body.error.code).toBe('validation_error');
		expect(r.body.error.fields.kind).toBeDefined();
	}
});

test('non-UUID id gives 404 as parseId does', async () => {
	const { acc, ev, body } = await setup();
	const params = { id: 'bukan-uuid', termId: 'bukan-uuid' };
	expect((await call(GET, await ev(acc, 'GET', { params }))).status).toBe(404);
	expect((await call(PUT, await ev(acc, 'PUT', { params, body: body() }))).status).toBe(404);
	expect((await call(DELETE, await ev(acc, 'DELETE', { params }))).status).toBe(404);
	expect((await call(PATCH, await ev(acc, 'PATCH', { params, body: { paid: true } }))).status).toBe(404);
});

test('entry of another company gives 404', async () => {
	const { acc, ev, body } = await setup();
	const id = (await call(POST, await ev(acc, 'POST', { body: body() }))).body.id as string;
	const termId = (await call(GET, await ev(acc, 'GET', { params: { id } }))).body.terms[0].id as string;

	const other = await makeCompany();
	const stranger = await makeUser();
	await addMember(stranger.id, other.companyId, 'accountant');
	const o = { cid: other.companyId, params: { id, termId } };
	expect((await call(GET, await ev(stranger, 'GET', o))).status).toBe(404);
	expect((await call(PUT, await ev(stranger, 'PUT', { ...o, body: body() }))).status).toBe(404);
	expect((await call(DELETE, await ev(stranger, 'DELETE', o))).status).toBe(404);
	expect((await call(PATCH, await ev(stranger, 'PATCH', { ...o, body: { paid: true } }))).status).toBe(404);
	const list = await call(LIST, await ev(stranger, 'GET', { cid: other.companyId, path: '/api/invoicing/ar-ap?kind=AR' }));
	expect(list.body.entries).toHaveLength(0);
});
