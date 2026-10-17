import { beforeEach, expect, test } from 'bun:test';
import { POST as POST_ACCOUNT } from '../../src/routes/api/accounts/+server';
import { POST as POST_RULE } from '../../src/routes/api/rules/+server';
import { POST as POST_USER } from '../../src/routes/api/users/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function adminCtx() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'admin');
	return { companyId, ctx: await contextFor(u, companyId) };
}

test('duplicate account code is reported on the code field', async () => {
	const { companyId, ctx } = await adminCtx();
	const parentId = await accountIdByCode(companyId, '1-1000');
	const res = await call(POST_ACCOUNT, fakeEvent({ ctx, method: 'POST', body: { code: '1-1001', name: 'Kas Lagi', parentId } }));
	expect(res.status).toBe(409);
	expect(res.body.error.code).toBe('duplicate_code');
	expect(res.body.error.fields).toEqual({ code: 'Kode akun 1-1001 sudah dipakai' });
});

test('schema validation errors are mapped to fields', async () => {
	const { ctx } = await adminCtx();
	const res = await call(POST_ACCOUNT, fakeEvent({ ctx, method: 'POST', body: {} }));
	expect(res.status).toBe(400);
	expect(res.body.error.code).toBe('validation_error');
	expect(Object.keys(res.body.error.fields).sort()).toEqual(['code', 'name', 'parentId']);
	expect(Array.isArray(res.body.error.details)).toBe(true);
});

test('too-short rule keyword is reported on the keyword field', async () => {
	const { companyId, ctx } = await adminCtx();
	const accountId = await accountIdByCode(companyId, '5-2010');
	const res = await call(POST_RULE, fakeEvent({ ctx, method: 'POST', body: { keyword: 'ab', accountId } }));
	expect(res.status).toBeGreaterThanOrEqual(400);
	expect(res.body.error.fields?.keyword).toBe('Keyword rule minimal 3 karakter');
});

test('adding a brand-new member reports the missing name or password on the right field', async () => {
	const { ctx } = await adminCtx();
	const noName = await call(POST_USER, fakeEvent({ ctx, method: 'POST', body: { email: 'baru@x.test', role: 'viewer', password: 'rahasia123' } }));
	expect(noName.status).toBe(422);
	expect(Object.keys(noName.body.error.fields)).toEqual(['name']);
	const noPassword = await call(POST_USER, fakeEvent({ ctx, method: 'POST', body: { email: 'baru@x.test', role: 'viewer', name: 'Baru' } }));
	expect(noPassword.status).toBe(422);
	expect(Object.keys(noPassword.body.error.fields)).toEqual(['password']);
});
