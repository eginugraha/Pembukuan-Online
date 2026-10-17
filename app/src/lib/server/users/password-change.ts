import { and, eq, ne } from 'drizzle-orm';
import { ApiError } from '../api';
import { db } from '../db';
import { authAccount, session } from '../db/schema';
import { loginThrottle, type LoginThrottle } from '../login-throttle';
import { hashPassword, verifyPassword } from '../password';

export { ChangePasswordInput } from '../../schemas/profile';

/**
 * Ganti password akun credential setelah memverifikasi password saat ini.
 * Sesi lain pengguna dicabut; sesi dengan token `keepSessionToken` (sesi saat ini) dipertahankan.
 */
export async function changePassword(
	userId: string,
	currentPassword: string,
	newPassword: string,
	opts: { keepSessionToken?: string; throttle?: LoginThrottle } = {}
): Promise<void> {
	const throttle = opts.throttle ?? loginThrottle;
	const key = `pwd:${userId}`;
	const gate = throttle.check(key);
	if (!gate.allowed) {
		throw new ApiError(429, 'too_many_attempts', `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(gate.retryAfterMs / 60_000)} menit`, undefined, { field: 'currentPassword' });
	}
	const [account] = await db
		.select({ id: authAccount.id, password: authAccount.password })
		.from(authAccount)
		.where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, 'credential')));
	if (!account?.password || !(await verifyPassword(currentPassword, account.password))) {
		throttle.fail(key);
		throw new ApiError(422, 'wrong_password', 'Password saat ini salah', undefined, { field: 'currentPassword' });
	}
	const hash = await hashPassword(newPassword);
	await db.transaction(async (tx) => {
		await tx.update(authAccount).set({ password: hash, updatedAt: new Date() }).where(eq(authAccount.id, account.id));
		await tx
			.delete(session)
			.where(opts.keepSessionToken ? and(eq(session.userId, userId), ne(session.token, opts.keepSessionToken)) : eq(session.userId, userId));
	});
	throttle.reset(key);
}
