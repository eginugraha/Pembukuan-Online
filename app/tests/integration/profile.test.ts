import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { user } from '../../src/lib/server/db/schema';
import { getAvatar, MAX_AVATAR_BYTES, removeAvatar, setAvatar } from '../../src/lib/server/users/avatar';
import { DELETE as DELETE_AVATAR, PUT as PUT_AVATAR } from '../../src/routes/api/profile/avatar/+server';
import { PATCH as PATCH_PROFILE } from '../../src/routes/api/profile/+server';
import { GET as GET_AVATAR } from '../../src/routes/api/users/[id]/avatar/+server';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { listMembers } from '../../src/lib/server/users/service';
import { resolveContext } from '../../src/lib/server/rbac';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

// Header minimal tiap format (cukup untuk deteksi magic bytes).
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const WEBP = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP'), 1, 2]);

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('setAvatar stores the image and points user.image at a versioned URL', async () => {
	const u = await makeUser();
	const url = await setAvatar(u.id, WEBP);
	expect(url).toMatch(new RegExp(`^/api/users/${u.id}/avatar\\?v=\\d+$`));
	const row = await db.query.user.findFirst({ where: eq(user.id, u.id) });
	expect(row?.image).toBe(url);
	const a = await getAvatar(u.id);
	expect(a?.mime).toBe('image/webp');
	expect([...a!.content]).toEqual([...WEBP]);

	await setAvatar(u.id, PNG);
	expect((await getAvatar(u.id))?.mime).toBe('image/png');
	await setAvatar(u.id, JPEG);
	expect((await getAvatar(u.id))?.mime).toBe('image/jpeg');
});

test('setAvatar rejects non-images and oversized files', async () => {
	const u = await makeUser();
	expect(await codeOf(setAvatar(u.id, new TextEncoder().encode('<svg onload=alert(1)>')))).toBe('invalid_image');
	const big = new Uint8Array(MAX_AVATAR_BYTES + 1);
	big.set(PNG);
	expect(await codeOf(setAvatar(u.id, big))).toBe('image_too_large');
	expect(await getAvatar(u.id)).toBeNull();
});

test('removeAvatar deletes the image and clears user.image', async () => {
	const u = await makeUser();
	await setAvatar(u.id, PNG);
	await removeAvatar(u.id);
	expect(await getAvatar(u.id)).toBeNull();
	expect((await db.query.user.findFirst({ where: eq(user.id, u.id) }))?.image).toBeNull();
});

test('PUT/DELETE /api/profile/avatar act on the signed-in user only', async () => {
	const u = await makeUser();
	const ctx = await contextFor(u);
	const form = new FormData();
	form.append('file', new File([WEBP], 'me.webp', { type: 'image/webp' }));
	const put = await call(PUT_AVATAR, fakeEvent({ ctx, method: 'PUT', form }));
	expect(put.status).toBe(200);
	expect(put.body.image).toMatch(`/api/users/${u.id}/avatar?v=`);

	const empty = await call(PUT_AVATAR, fakeEvent({ ctx, method: 'PUT', form: new FormData() }));
	expect(empty.status).toBe(400);
	expect((await call(PUT_AVATAR, fakeEvent({ ctx: null, method: 'PUT', form }))).status).toBe(401);

	expect((await call(DELETE_AVATAR, fakeEvent({ ctx, method: 'DELETE' }))).status).toBe(200);
	expect(await getAvatar(u.id)).toBeNull();
});

test('GET /api/users/:id/avatar serves the image with cache headers; 404 without; 401 anonymous', async () => {
	const owner = await makeUser();
	const viewer = await makeUser();
	const ctx = await contextFor(viewer);
	const ev = () => fakeEvent({ ctx, params: { id: owner.id } });

	expect((await GET_AVATAR(ev() as never)).status).toBe(404);
	await setAvatar(owner.id, PNG);
	const res = await GET_AVATAR(ev() as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('image/png');
	expect(res.headers.get('cache-control')).toContain('private');
	expect(res.headers.get('x-content-type-options')).toBe('nosniff');
	expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...PNG]);

	expect((await GET_AVATAR(fakeEvent({ ctx: null, params: { id: owner.id } }) as never)).status).toBe(401);
	expect((await GET_AVATAR(fakeEvent({ ctx, params: { id: 'bukan-uuid' } }) as never)).status).toBe(404);
});

test('PATCH /api/profile updates the trimmed name and rejects empty', async () => {
	const u = await makeUser();
	const ctx = await contextFor(u);
	const ok = await call(PATCH_PROFILE, fakeEvent({ ctx, method: 'PATCH', body: { name: '  Budi Santoso  ' } }));
	expect(ok.status).toBe(200);
	expect((await db.query.user.findFirst({ where: eq(user.id, u.id) }))?.name).toBe('Budi Santoso');
	expect((await call(PATCH_PROFILE, fakeEvent({ ctx, method: 'PATCH', body: { name: '   ' } }))).status).toBe(400);
});

test('member list and session context expose the avatar URL', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const url = await setAvatar(u.id, PNG);
	expect((await listMembers(companyId)).find((m) => m.userId === u.id)?.image).toBe(url);
	const ctx = await resolveContext({ id: u.id, email: u.email, name: u.name, isSuperAdmin: false, image: url });
	expect(ctx.user.image).toBe(url);
});
