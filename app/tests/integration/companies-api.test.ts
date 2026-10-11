import { beforeEach, expect, test } from 'bun:test';
import { GET } from '../../src/routes/api/companies/+server';
import { POST as SWITCH } from '../../src/routes/api/companies/switch/+server';
import { COMPANY_COOKIE } from '../../src/lib/server/rbac';
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
