import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { companies } from '../../src/lib/server/db/schema';
import { getCompanyAsset, removeCompanyAsset, setCompanyAsset } from '../../src/lib/server/company/assets';
import { MAX_LOGO_BYTES } from '../../src/lib/server/company/logo';
import { PUT, DELETE, GET } from '../../src/routes/api/companies/[id]/assets/[kind]/+server';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};
const form = (bytes: Uint8Array = PNG) => {
	const f = new FormData();
	f.append('file', new File([new Uint8Array(bytes)], 'a.png', { type: 'image/png' }));
	return f;
};

test('setCompanyAsset stores per kind and fills the matching URL column', async () => {
	const { companyId } = await makeCompany();
	const url = await setCompanyAsset(companyId, 'signature', PNG);
	expect(url).toMatch(new RegExp(`^/api/companies/${companyId}/assets/signature\\?v=\\d+$`));
	let row = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	expect(row?.signatureUrl).toBe(url);
	expect(row?.watermarkUrl).toBeNull();
	const wurl = await setCompanyAsset(companyId, 'watermark', PNG);
	row = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	expect(row?.watermarkUrl).toBe(wurl);
	const a = await getCompanyAsset(companyId, 'signature');
	expect(a?.mime).toBe('image/png');
	expect([...a!.content]).toEqual([...PNG]);
});

test('setCompanyAsset rejects oversized files and non-images', async () => {
	const { companyId } = await makeCompany();
	const big = new Uint8Array(MAX_LOGO_BYTES + 1);
	big.set(PNG);
	expect(await codeOf(setCompanyAsset(companyId, 'signature', big))).toBe('image_too_large');
	expect(await codeOf(setCompanyAsset(companyId, 'watermark', new TextEncoder().encode('hello')))).toBe('invalid_image');
	expect(await getCompanyAsset(companyId, 'signature')).toBeNull();
});

test('removeCompanyAsset clears the row and URL', async () => {
	const { companyId } = await makeCompany();
	await setCompanyAsset(companyId, 'signature', PNG);
	await removeCompanyAsset(companyId, 'signature');
	expect(await getCompanyAsset(companyId, 'signature')).toBeNull();
	expect((await db.query.companies.findFirst({ where: eq(companies.id, companyId) }))?.signatureUrl).toBeNull();
});

test('routes: PUT/DELETE admin only, GET viewer with cache headers, bad kind and other company 404', async () => {
	const { companyId } = await makeCompany();
	const { companyId: other } = await makeCompany('B');
	const admin = await makeUser();
	await addMember(admin.id, companyId, 'admin');
	await addMember(admin.id, other, 'admin');
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const adminCtx = await contextFor(admin, companyId);
	const viewerCtx = await contextFor(viewer, companyId);
	const p = (id: string, kind: string) => ({ id, kind });

	expect((await call(PUT, fakeEvent({ ctx: viewerCtx, method: 'PUT', params: p(companyId, 'signature'), form: form() }))).status).toBe(403);
	expect((await call(PUT, fakeEvent({ ctx: adminCtx, method: 'PUT', params: p(companyId, 'foo'), form: form() }))).status).toBe(404);
	expect((await call(PUT, fakeEvent({ ctx: adminCtx, method: 'PUT', params: p(other, 'signature'), form: form() }))).status).toBe(404);
	const put = await call(PUT, fakeEvent({ ctx: adminCtx, method: 'PUT', params: p(companyId, 'signature'), form: form() }));
	expect(put.status).toBe(200);
	expect(put.body.image).toMatch(`/api/companies/${companyId}/assets/signature?v=`);

	const res = await GET(fakeEvent({ ctx: viewerCtx, params: p(companyId, 'signature') }) as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('image/png');
	expect(res.headers.get('cache-control')).toContain('private');
	expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...PNG]);
	expect((await GET(fakeEvent({ ctx: viewerCtx, params: p(companyId, 'watermark') }) as never)).status).toBe(404);
	expect((await GET(fakeEvent({ ctx: viewerCtx, params: p(companyId, 'foo') }) as never)).status).toBe(404);

	expect((await call(DELETE, fakeEvent({ ctx: viewerCtx, method: 'DELETE', params: p(companyId, 'signature') }))).status).toBe(403);
	expect((await call(DELETE, fakeEvent({ ctx: adminCtx, method: 'DELETE', params: p(companyId, 'signature') }))).status).toBe(200);
	expect(await getCompanyAsset(companyId, 'signature')).toBeNull();
});
