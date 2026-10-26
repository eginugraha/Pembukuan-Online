import { and, asc, eq } from 'drizzle-orm';
import type { Role } from '../../roles';
import { CreateUserInput, SetMembershipInput, UpdateUserInput } from '../../schemas/user-admin';
import { ApiError, notFound } from '../api';
import { db } from '../db';
import { authAccount, companies, session, user, userCompanies } from '../db/schema';
import { hashPassword } from '../password';
import { createUserWithPassword, findUserByEmail, normalizeEmail } from './create';
import { changeRole } from './service';

export { CreateUserInput, SetMembershipInput, UpdateUserInput };

export type SystemUser = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	isSuperAdmin: boolean;
	createdAt: Date;
	companies: { id: string; name: string; role: Role }[];
};

const emailTaken = () => new ApiError(409, 'email_taken', 'Email sudah terdaftar', undefined, { field: 'email' });

export async function listAllUsers(): Promise<SystemUser[]> {
	const users = await db
		.select({ id: user.id, email: user.email, name: user.name, image: user.image, isSuperAdmin: user.isSuperAdmin, createdAt: user.createdAt })
		.from(user)
		.orderBy(asc(user.email));
	const memberships = await db
		.select({ userId: userCompanies.userId, id: companies.id, name: companies.name, role: userCompanies.role })
		.from(userCompanies)
		.innerJoin(companies, eq(companies.id, userCompanies.companyId))
		.orderBy(asc(companies.name));
	const byUser = new Map<string, SystemUser['companies']>();
	for (const m of memberships) {
		const list = byUser.get(m.userId) ?? [];
		list.push({ id: m.id, name: m.name, role: m.role as Role });
		byUser.set(m.userId, list);
	}
	return users.map((u) => ({ ...u, companies: byUser.get(u.id) ?? [] }));
}

export async function createUser(input: CreateUserInput): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		if (await findUserByEmail(tx, input.email)) throw emailTaken();
		const created = await createUserWithPassword(tx, {
			email: input.email,
			name: input.name,
			password: input.password,
			isSuperAdmin: input.isSuperAdmin
		});
		return { id: created.id };
	});
}

export async function updateUser(userId: string, input: UpdateUserInput): Promise<void> {
	const hash = input.password ? await hashPassword(input.password) : null;
	await db.transaction(async (tx) => {
		const [target] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId));
		if (!target) throw notFound('Pengguna');
		const existing = await findUserByEmail(tx, input.email);
		if (existing && existing.id !== userId) throw emailTaken();
		await tx
			.update(user)
			.set({ name: input.name.trim(), email: normalizeEmail(input.email), updatedAt: new Date() })
			.where(eq(user.id, userId));
		if (hash) {
			await tx
				.update(authAccount)
				.set({ password: hash, updatedAt: new Date() })
				.where(and(eq(authAccount.userId, userId), eq(authAccount.providerId, 'credential')));
			await tx.delete(session).where(eq(session.userId, userId));
		}
	});
}

export async function deleteUser(actorId: string, userId: string): Promise<void> {
	if (actorId === userId) throw new ApiError(409, 'cannot_delete_self', 'Anda tidak dapat menghapus akun sendiri');
	await db.transaction(async (tx) => {
		// Kunci semua baris super admin supaya dua hapus bersamaan tidak sama-sama lolos (READ COMMITTED).
		const supers = await tx.select({ id: user.id }).from(user).where(eq(user.isSuperAdmin, true)).for('update');
		if (supers.some((s) => s.id === userId) && supers.length <= 1) {
			throw new ApiError(409, 'last_super_admin', 'Super admin terakhir tidak dapat dihapus');
		}
		const [target] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId));
		if (!target) throw notFound('Pengguna');
		await tx.delete(user).where(eq(user.id, userId));
	});
}

export async function setMembership(userId: string, companyId: string, role: Role): Promise<void> {
	const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
	if (!u) throw notFound('Pengguna');
	const [c] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId));
	if (!c) throw notFound('Perusahaan');
	const [m] = await db
		.select({ id: userCompanies.id })
		.from(userCompanies)
		.where(and(eq(userCompanies.userId, userId), eq(userCompanies.companyId, companyId)));
	if (m) return changeRole(companyId, userId, role);
	await db.insert(userCompanies).values({ userId, companyId, role });
}
