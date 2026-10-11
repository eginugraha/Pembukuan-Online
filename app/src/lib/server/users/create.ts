import { eq } from 'drizzle-orm';
import type { Executor } from '../db';
import { authAccount, user } from '../db/schema';
import { hashPassword } from '../password';

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export async function createUserWithPassword(
	ex: Executor,
	input: { email: string; name: string; password: string; isSuperAdmin?: boolean }
): Promise<{ id: string; email: string; name: string; isSuperAdmin: boolean }> {
	const hash = await hashPassword(input.password);
	const [created] = await ex
		.insert(user)
		.values({
			email: normalizeEmail(input.email),
			name: input.name.trim(),
			emailVerified: true,
			isSuperAdmin: input.isSuperAdmin ?? false
		})
		.returning({ id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin });
	// Format akun credential Better Auth: accountId = userId, providerId = 'credential'.
	await ex.insert(authAccount).values({
		userId: created.id,
		accountId: created.id,
		providerId: 'credential',
		password: hash
	});
	return created;
}

export async function findUserByEmail(ex: Executor, email: string) {
	const [row] = await ex
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			isSuperAdmin: user.isSuperAdmin,
			isActive: user.isActive
		})
		.from(user)
		.where(eq(user.email, normalizeEmail(email)))
		.limit(1);
	return row ?? null;
}
