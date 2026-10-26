import { beforeEach, expect, test } from 'bun:test';
import { GET, POST } from '../../src/routes/api/companies/+server';
import { POST as SWITCH } from '../../src/routes/api/companies/switch/+server';
import { COMPANY_COOKIE } from '../../src/lib/server/rbac';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts } from '../../src/lib/server/db/schema';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

test('lists own companies', async () => {
	const a = await makeCompany('PT A');
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'viewer');
	const res = await call(GET, fakeEvent({ ctx: await contextFor(u) }));
	expect(res.status).toBe(200);
	expect(res.body.companies.map((c: { id: string }) => c.id)).toEqual([a.companyId]);
	expect(res.body.activeCompanyId).toBe(a.companyId);
});

test('switch to own company sets cookie; foreign company is 404; anonymous is 401', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const c = await makeCompany('PT C');
	const u = await makeUser();
	await addMember(u.id, a.companyId, 'viewer');
	await addMember(u.id, b.companyId, 'admin');
	const ctx = await contextFor(u);

	const ok = fakeEvent({ ctx, method: 'POST', body: { companyId: b.companyId } });
	expect((await call(SWITCH, ok)).status).toBe(200);
	expect(ok.jar[COMPANY_COOKIE]).toBe(b.companyId);

	const foreign = fakeEvent({ ctx, method: 'POST', body: { companyId: c.companyId } });
	expect((await call(SWITCH, foreign)).status).toBe(404);

	const anon = fakeEvent({ ctx: null, method: 'POST', body: { companyId: a.companyId } });
	expect((await call(SWITCH, anon)).status).toBe(401);
});

test('super admin creates company from chosen CoA template; unknown template is 400', async () => {
	const admin = await makeUser({ isSuperAdmin: true });
	const ctx = await contextFor(admin);
	const res = await call(POST, fakeEvent({ ctx, method: 'POST', body: { name: 'PT IT', coaTemplate: 'it' } }));
	expect(res.status).toBe(201);
	const names = (await db.select().from(accounts).where(eq(accounts.companyId, res.body.id))).map((a) => a.name);
	expect(names).toContain('Cloud, Hosting & Server');

	const bad = await call(POST, fakeEvent({ ctx, method: 'POST', body: { name: 'PT X', coaTemplate: 'pabrik' } }));
	expect(bad.status).toBe(400);
});

test('updateCompany menyimpan field baru dan tidak menghapusnya bila tidak dikirim', async () => {
	const { updateCompany, getCompany } = await import('../../src/lib/server/company/service');
	const { UpdateCompanyInput } = await import('../../src/lib/schemas/company');
	const { companyId } = await makeCompany('PT A');
	await updateCompany(companyId, UpdateCompanyInput.parse({ name: 'PT A', code: 'set', bankName: 'BCA' }));
	const c = await getCompany(companyId);
	expect(c.code).toBe('SET');
	expect(c.bankName).toBe('BCA');
	await updateCompany(companyId, UpdateCompanyInput.parse({ name: 'PT A2' }));
	const c2 = await getCompany(companyId);
	expect(c2.bankName).toBe('BCA');
	expect(c2.code).toBe('SET');
});
