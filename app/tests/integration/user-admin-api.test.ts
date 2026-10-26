import { beforeEach, expect, test } from 'bun:test';
import { GET, POST } from '../../src/routes/api/admin/users/+server';
import { DELETE as DEL_USER, PATCH } from '../../src/routes/api/admin/users/[id]/+server';
import {
	DELETE as DEL_MEMBERSHIP,
	PUT
} from '../../src/routes/api/admin/users/[id]/companies/[companyId]/+server';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

test('every route is 401 anonymous, 403 for company admin and viewer, and works for super admin', async () => {
	const co = await makeCompany('PT A');
	const target = await makeUser({ email: 'target@example.com' });
	const admin = await makeUser({ email: 'ca@example.com' });
	const viewer = await makeUser({ email: 'cv@example.com' });
	const root = await makeUser({ email: 'root@example.com', isSuperAdmin: true });
	await addMember(admin.id, co.companyId, 'admin');
	await addMember(viewer.id, co.companyId, 'viewer');
	const params = { id: target.id, companyId: co.companyId };

	type Row = { name: string; handler: Parameters<typeof call>[0]; method: string; body?: unknown; ok: number; params?: Record<string, string> };
	const rows = (): Row[] => [
		{ name: 'GET', handler: GET, method: 'GET', ok: 200 },
		{ name: 'POST', handler: POST, method: 'POST', body: { name: 'Baru', email: 'baru@example.com', password: 'password123' }, ok: 201 },
		{ name: 'PATCH', handler: PATCH, method: 'PATCH', body: { name: 'Target 2', email: 'target@example.com' }, ok: 200, params },
		{ name: 'PUT', handler: PUT, method: 'PUT', body: { role: 'viewer' }, ok: 200, params },
		{ name: 'DEL membership', handler: DEL_MEMBERSHIP, method: 'DELETE', ok: 200, params },
		{ name: 'DEL user', handler: DEL_USER, method: 'DELETE', ok: 200, params }
	];

	const ctxs = [
		[null, 401],
		[await contextFor(admin, co.companyId), 403],
		[await contextFor(viewer, co.companyId), 403]
	] as const;
	for (const [ctx, status] of ctxs) {
		for (const r of rows()) {
			const res = await call(r.handler, fakeEvent({ ctx, method: r.method, body: r.body, params: r.params }));
			expect([r.name, res.status]).toEqual([r.name, status]);
		}
	}

	const rootCtx = await contextFor(root);
	for (const r of rows()) {
		const res = await call(r.handler, fakeEvent({ ctx: rootCtx, method: r.method, body: r.body, params: r.params }));
		expect([r.name, res.status]).toEqual([r.name, r.ok]);
	}
});

test('GET lists users and POST returns the new id', async () => {
	const root = await makeUser({ isSuperAdmin: true });
	const ctx = await contextFor(root);
	const created = await call(POST, fakeEvent({ ctx, method: 'POST', body: { name: 'Baru', email: 'baru@example.com', password: 'password123' } }));
	expect(created.status).toBe(201);
	const list = await call(GET, fakeEvent({ ctx }));
	expect(list.body.users.map((u: { id: string }) => u.id)).toContain(created.body.id);
});

test('POST validation errors are 400 with field messages', async () => {
	const root = await makeUser({ isSuperAdmin: true });
	const ctx = await contextFor(root);
	const res = await call(POST, fakeEvent({ ctx, method: 'POST', body: { name: 'X', email: 'bukan-email', password: 'pendek' } }));
	expect(res.status).toBe(400);
	const text = JSON.stringify(res.body);
	expect(text).toContain('password');
	expect(text).toContain('email');
});

test('super admin cannot delete themselves via the API', async () => {
	const root = await makeUser({ isSuperAdmin: true });
	const res = await call(DEL_USER, fakeEvent({ ctx: await contextFor(root), method: 'DELETE', params: { id: root.id } }));
	expect(res.status).toBe(409);
	expect(res.body.error.code ?? res.body.code).toBe('cannot_delete_self');
});

test('PUT membership then DELETE membership round-trips; last admin is 409', async () => {
	const root = await makeUser({ isSuperAdmin: true });
	const ctx = await contextFor(root);
	const co = await makeCompany('PT A');
	const u = await makeUser();
	const params = { id: u.id, companyId: co.companyId };

	expect((await call(PUT, fakeEvent({ ctx, method: 'PUT', body: { role: 'admin' }, params }))).status).toBe(200);
	const last = await call(DEL_MEMBERSHIP, fakeEvent({ ctx, method: 'DELETE', params }));
	expect(last.status).toBe(409);
	expect(JSON.stringify(last.body)).toContain('last_admin');

	const other = await makeUser();
	await addMember(other.id, co.companyId, 'admin');
	expect((await call(PUT, fakeEvent({ ctx, method: 'PUT', body: { role: 'viewer' }, params }))).status).toBe(200);
	expect((await call(DEL_MEMBERSHIP, fakeEvent({ ctx, method: 'DELETE', params }))).status).toBe(200);
});
