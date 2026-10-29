import { beforeEach, expect, test } from 'bun:test';
import { GET, POST } from '../../src/routes/api/companies/[id]/coa-template/+server';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const allRename = (diff: { conflicts: Array<{ code: string }> }) =>
	Object.fromEntries(diff.conflicts.map((c) => [c.code, { action: 'rename', reactivate: false }]));

test('admin previews and applies; accountant is 403; other company is 404', async () => {
	const { companyId } = await makeCompany();
	const admin = await makeUser(); await addMember(admin.id, companyId, 'admin');
	const acc = await makeUser(); await addMember(acc.id, companyId, 'accountant');
	const path = `/api/companies/${companyId}/coa-template?target=it`;
	const prev = await call(GET, fakeEvent({ ctx: await contextFor(admin), path, params: { id: companyId } }));
	expect(prev.status).toBe(200);
	expect(prev.body.diff.conflicts).toHaveLength(25);
	expect(Array.isArray(prev.body.pendingRules)).toBe(true);
	expect(prev.body.pendingRules.length).toBeGreaterThan(0);
	expect((await call(GET, fakeEvent({ ctx: await contextFor(acc), path, params: { id: companyId } }))).status).toBe(403);
	const body = { target: 'it', fingerprint: prev.body.fingerprint, conflicts: allRename(prev.body.diff), missing: {}, skip: [] };
	const res = await call(POST, fakeEvent({ ctx: await contextFor(admin), method: 'POST', body, params: { id: companyId } }));
	expect(res.status).toBe(200);
	expect(res.body.summary.created).toBe(19);
	const other = await makeCompany('PT B');
	expect((await call(GET, fakeEvent({ ctx: await contextFor(admin), path, params: { id: other.companyId } }))).status).toBe(404);
});

test('unknown target is 400', async () => {
	const { companyId } = await makeCompany();
	const admin = await makeUser(); await addMember(admin.id, companyId, 'admin');
	const ctx = await contextFor(admin);
	const params = { id: companyId };
	const bad = `/api/companies/${companyId}/coa-template?target=pabrik`;
	const get = await call(GET, fakeEvent({ ctx, path: bad, params }));
	expect(get.status).toBe(400);
	expect(get.body.error.message).toBe('Template bagan akun tidak valid');
	const missing = await call(GET, fakeEvent({ ctx, path: `/api/companies/${companyId}/coa-template`, params }));
	expect(missing.status).toBe(400);
	const post = await call(POST, fakeEvent({ ctx, method: 'POST', body: { target: 'pabrik', fingerprint: 'x', conflicts: {}, missing: {}, skip: [] }, params }));
	expect(post.status).toBe(400);
});
