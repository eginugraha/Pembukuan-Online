import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { companies } from '../../src/lib/server/db/schema';
import { getCompanyLogo, MAX_LOGO_BYTES, removeCompanyLogo, setCompanyLogo } from '../../src/lib/server/company/logo';
import { PUT as PUT_LOGO, DELETE as DELETE_LOGO, GET as GET_LOGO } from '../../src/routes/api/companies/[id]/logo/+server';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { resolveContext } from '../../src/lib/server/rbac';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const WEBP = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP'), 1, 2]);

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('setCompanyLogo stores the image and points companies.logoUrl at a versioned URL', async () => {
	const { companyId } = await makeCompany();
	const url = await setCompanyLogo(companyId, WEBP);
	expect(url).toMatch(new RegExp(`^/api/companies/${companyId}/logo\\?v=\\d+$`));
	const row = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	expect(row?.logoUrl).toBe(url);
	const logo = await getCompanyLogo(companyId);
	expect(logo?.mime).toBe('image/webp');
	expect([...logo!.content]).toEqual([...WEBP]);
});

test('setCompanyLogo rejects non-images and oversized files', async () => {
	const { companyId } = await makeCompany();
	expect(await codeOf(setCompanyLogo(companyId, new TextEncoder().encode('<svg onload=alert(1)>')))).toBe('invalid_image');
	const big = new Uint8Array(MAX_LOGO_BYTES + 1);
	big.set(PNG);
	expect(await codeOf(setCompanyLogo(companyId, big))).toBe('image_too_large');
	expect(await getCompanyLogo(companyId)).toBeNull();
});

test('setCompanyLogo re-upload changes the cache-busting version', async () => {
	const { companyId } = await makeCompany();
	const url1 = await setCompanyLogo(companyId, PNG);
	const url2 = await setCompanyLogo(companyId, WEBP);
	expect(url2).not.toBe(url1);
});

test('removeCompanyLogo deletes the image and clears companies.logoUrl', async () => {
	const { companyId } = await makeCompany();
	await setCompanyLogo(companyId, PNG);
	await removeCompanyLogo(companyId);
	expect(await getCompanyLogo(companyId)).toBeNull();
	expect((await db.query.companies.findFirst({ where: eq(companies.id, companyId) }))?.logoUrl).toBeNull();
});

test('PUT/DELETE /api/companies/:id/logo require admin on the active company (viewer and accountant both rejected)', async () => {
	const { companyId } = await makeCompany();
	const admin = await makeUser();
	await addMember(admin.id, companyId, 'admin');
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const accountant = await makeUser();
	await addMember(accountant.id, companyId, 'accountant');
	const adminCtx = await contextFor(admin, companyId);
	const viewerCtx = await contextFor(viewer, companyId);
	const accountantCtx = await contextFor(accountant, companyId);

	const form = () => {
		const f = new FormData();
		f.append('file', new File([WEBP], 'logo.webp', { type: 'image/webp' }));
		return f;
	};

	expect((await call(PUT_LOGO, fakeEvent({ ctx: viewerCtx, method: 'PUT', params: { id: companyId }, form: form() }))).status).toBe(403);
	expect((await call(PUT_LOGO, fakeEvent({ ctx: accountantCtx, method: 'PUT', params: { id: companyId }, form: form() }))).status).toBe(403);
	const put = await call(PUT_LOGO, fakeEvent({ ctx: adminCtx, method: 'PUT', params: { id: companyId }, form: form() }));
	expect(put.status).toBe(200);
	expect(put.body.image).toMatch(`/api/companies/${companyId}/logo?v=`);

	expect((await call(DELETE_LOGO, fakeEvent({ ctx: viewerCtx, method: 'DELETE', params: { id: companyId } }))).status).toBe(403);
	expect((await call(DELETE_LOGO, fakeEvent({ ctx: accountantCtx, method: 'DELETE', params: { id: companyId } }))).status).toBe(403);
	expect((await call(DELETE_LOGO, fakeEvent({ ctx: adminCtx, method: 'DELETE', params: { id: companyId } }))).status).toBe(200);
	expect(await getCompanyLogo(companyId)).toBeNull();
});

test('PUT /api/companies/:id/logo 404s when :id is not the caller\'s active company', async () => {
	const { companyId: own } = await makeCompany('A');
	const { companyId: other } = await makeCompany('B');
	const admin = await makeUser();
	await addMember(admin.id, own, 'admin');
	await addMember(admin.id, other, 'admin');
	const ctx = await contextFor(admin, own);
	const form = new FormData();
	form.append('file', new File([WEBP], 'logo.webp', { type: 'image/webp' }));
	expect((await call(PUT_LOGO, fakeEvent({ ctx, method: 'PUT', params: { id: other }, form }))).status).toBe(404);
});

test('GET /api/companies/:id/logo serves the image with cache headers to members; 404 without logo; 401 anonymous', async () => {
	const { companyId } = await makeCompany();
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const ctx = await contextFor(viewer, companyId);
	const ev = () => fakeEvent({ ctx, params: { id: companyId } });

	expect((await GET_LOGO(ev() as never)).status).toBe(404);
	await setCompanyLogo(companyId, PNG);
	const res = await GET_LOGO(ev() as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('image/png');
	expect(res.headers.get('cache-control')).toContain('private');
	expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...PNG]);

	expect((await GET_LOGO(fakeEvent({ ctx: null, params: { id: companyId } }) as never)).status).toBe(401);
});

test('resolveContext exposes each company\'s own logoUrl, never another company\'s', async () => {
	const { companyId: a } = await makeCompany('A');
	const { companyId: b } = await makeCompany('B');
	const admin = await makeUser();
	await addMember(admin.id, a, 'admin');
	await addMember(admin.id, b, 'admin');
	const urlA = await setCompanyLogo(a, PNG);
	const ctx = await resolveContext({ id: admin.id, email: admin.email, name: admin.name, isSuperAdmin: false }, a);
	expect(ctx.companies.find((c) => c.id === a)?.logoUrl).toBe(urlA);
	expect(ctx.companies.find((c) => c.id === b)?.logoUrl).toBeNull();
});
