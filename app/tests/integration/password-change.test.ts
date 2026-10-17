import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { authAccount, session } from '../../src/lib/server/db/schema';
import { createLoginThrottle } from '../../src/lib/server/login-throttle';
import { verifyPassword } from '../../src/lib/server/password';
import { changePassword } from '../../src/lib/server/users/password-change';
import { PUT } from '../../src/routes/api/profile/password/+server';
import { contextFor, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const hashOf = async (userId: string) => (await db.select().from(authAccount).where(eq(authAccount.userId, userId)))[0].password!;
const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};
const addSession = async (userId: string, token: string) => {
	await db.insert(session).values({ userId, token, expiresAt: new Date(Date.now() + 86_400_000) });
};

test('changes the password: the new one verifies, the old one no longer does', async () => {
	const u = await makeUser({ password: 'password-lama-1' });
	await changePassword(u.id, 'password-lama-1', 'password-baru-2');
	const hash = await hashOf(u.id);
	expect(await verifyPassword('password-baru-2', hash)).toBe(true);
	expect(await verifyPassword('password-lama-1', hash)).toBe(false);
});

test('a wrong current password is rejected on its own field and changes nothing', async () => {
	const u = await makeUser({ password: 'password-lama-1' });
	const before = await hashOf(u.id);
	let err: { code: string; field?: string; status: number } | null = null;
	try {
		await changePassword(u.id, 'salah-total', 'password-baru-2');
	} catch (e) {
		err = e as typeof err;
	}
	expect(err).toMatchObject({ code: 'wrong_password', field: 'currentPassword', status: 422 });
	expect(await hashOf(u.id)).toBe(before);
});

test('other sessions are signed out, the current one stays, other users are untouched', async () => {
	const u = await makeUser({ password: 'password-lama-1' });
	const other = await makeUser();
	await addSession(u.id, 'laptop');
	await addSession(u.id, 'hp');
	await addSession(other.id, 'orang-lain');
	await changePassword(u.id, 'password-lama-1', 'password-baru-2', { keepSessionToken: 'laptop' });
	expect((await db.select().from(session).where(eq(session.userId, u.id))).map((s) => s.token)).toEqual(['laptop']);
	expect(await db.select().from(session).where(eq(session.userId, other.id))).toHaveLength(1);
});

test('without a known current session every session is signed out', async () => {
	const u = await makeUser({ password: 'password-lama-1' });
	await addSession(u.id, 'a');
	await changePassword(u.id, 'password-lama-1', 'password-baru-2');
	expect(await db.select().from(session).where(eq(session.userId, u.id))).toHaveLength(0);
});

test('repeated wrong guesses are throttled, even if the next guess is right; success resets it', async () => {
	const u = await makeUser({ password: 'password-lama-1' });
	const throttle = createLoginThrottle({ maxFailures: 3, windowMs: 60_000 });
	for (let i = 0; i < 3; i++) expect(await codeOf(changePassword(u.id, 'tebak', 'password-baru-2', { throttle }))).toBe('wrong_password');
	expect(await codeOf(changePassword(u.id, 'password-lama-1', 'password-baru-2', { throttle }))).toBe('too_many_attempts');
	expect(await verifyPassword('password-lama-1', await hashOf(u.id))).toBe(true);

	const fresh = createLoginThrottle({ maxFailures: 3, windowMs: 60_000 });
	await codeOf(changePassword(u.id, 'tebak', 'password-baru-2', { throttle: fresh }));
	await changePassword(u.id, 'password-lama-1', 'password-baru-2', { throttle: fresh });
	expect(fresh.check(u.id).allowed).toBe(true);
});

test('PUT /api/profile/password: 401 anonymous, field errors for bad input, 200 on success', async () => {
	const u = await makeUser({ password: 'password-lama-1' });
	const ctx = await contextFor(u);
	const body = { currentPassword: 'password-lama-1', newPassword: 'password-baru-2', confirmPassword: 'password-baru-2' };

	expect((await call(PUT, fakeEvent({ ctx: null, method: 'PUT', body }))).status).toBe(401);

	const mismatch = await call(PUT, fakeEvent({ ctx, method: 'PUT', body: { ...body, confirmPassword: 'beda' } }));
	expect(mismatch.status).toBe(400);
	expect(mismatch.body.error.fields.confirmPassword).toBe('Konfirmasi password tidak sama');

	const short = await call(PUT, fakeEvent({ ctx, method: 'PUT', body: { ...body, newPassword: 'pendek', confirmPassword: 'pendek' } }));
	expect(short.body.error.fields.newPassword).toBe('Password baru minimal 8 karakter');

	const same = await call(PUT, fakeEvent({ ctx, method: 'PUT', body: { ...body, newPassword: 'password-lama-1', confirmPassword: 'password-lama-1' } }));
	expect(same.body.error.fields.newPassword).toBe('Password baru harus berbeda dari password saat ini');

	const wrong = await call(PUT, fakeEvent({ ctx, method: 'PUT', body: { ...body, currentPassword: 'salah' } }));
	expect(wrong.status).toBe(422);
	expect(Object.keys(wrong.body.error.fields)).toEqual(['currentPassword']);

	expect((await call(PUT, fakeEvent({ ctx, method: 'PUT', body }))).status).toBe(200);
	expect(await verifyPassword('password-baru-2', await hashOf(u.id))).toBe(true);
});
