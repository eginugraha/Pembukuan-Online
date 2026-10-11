import { beforeEach, expect, test } from 'bun:test';
import { requireCompany, requireRole, requireSuperAdmin, requireUser } from '../../src/lib/server/rbac';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const ev = (ctx: Awaited<ReturnType<typeof contextFor>> | null) => ({ locals: { ctx } }) as never;

test('member only sees own companies with own role', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'accountant');
	const ctx = await contextFor(u, a.companyId);
	expect(ctx.companies.map((c) => c.id)).toEqual([a.companyId]);
	expect(ctx.companyId).toBe(a.companyId);
	expect(ctx.role).toBe('accountant');
	expect(ctx.companies.some((c) => c.id === b.companyId)).toBe(false);
});

test('tampered company cookie falls back to own company', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'viewer');
	const ctx = await contextFor(u, b.companyId);
	expect(ctx.companyId).toBe(a.companyId);
	expect(ctx.role).toBe('viewer');
});

test('super admin sees every company as admin', async () => {
	await makeCompany('PT A');
	await makeCompany('PT B');
	const su = await makeUser({ isSuperAdmin: true });
	const ctx = await contextFor(su);
	expect(ctx.companies).toHaveLength(2);
	expect(ctx.companies.every((c) => c.role === 'admin')).toBe(true);
	expect(ctx.role).toBe('admin');
});

test('user without company has null company and gets no_company', async () => {
	const u = await makeUser();
	const ctx = await contextFor(u);
	expect(ctx.companyId).toBeNull();
	expect(() => requireCompany(ev(ctx))).toThrow(expect.objectContaining({ status: 409, code: 'no_company' }));
});

test('require helpers enforce auth and role', async () => {
	const a = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'viewer');
	const ctx = await contextFor(u);
	expect(() => requireUser(ev(null))).toThrow(expect.objectContaining({ status: 401 }));
	expect(requireRole(ev(ctx), 'viewer').companyId).toBe(a.companyId);
	expect(() => requireRole(ev(ctx), 'accountant')).toThrow(expect.objectContaining({ status: 403 }));
	expect(() => requireSuperAdmin(ev(ctx))).toThrow(expect.objectContaining({ status: 403 }));
});
