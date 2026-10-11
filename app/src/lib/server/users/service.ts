import { and, asc, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Role } from '../../roles';
import { ApiError, notFound } from '../api';
import { db, type Executor } from '../db';
import { user, userCompanies } from '../db/schema';
import { createUserWithPassword, findUserByEmail } from './create';

const roleEnum = z.enum(['admin', 'accountant', 'viewer']);

export const AddMemberInput = z.object({
	email: z.email(),
	name: z.string().trim().min(1).max(200).optional(),
	password: z.string().min(8).optional(),
	role: roleEnum
});
export type AddMemberInput = z.infer<typeof AddMemberInput>;
export const ChangeRoleInput = z.object({ role: roleEnum });
export const SuperAdminInput = z.object({ value: z.boolean() });

export async function listMembers(companyId: string) {
	return db
		.select({ userId: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin, role: userCompanies.role })
		.from(userCompanies)
		.innerJoin(user, eq(user.id, userCompanies.userId))
		.where(eq(userCompanies.companyId, companyId))
		.orderBy(asc(user.email));
}

export async function addMember(companyId: string, input: AddMemberInput): Promise<{ userId: string; created: boolean }> {
	return db.transaction(async (tx) => {
		const existing = await findUserByEmail(tx, input.email);
		let userId: string;
		let created = false;
		if (existing) {
			userId = existing.id;
			const [membership] = await tx
				.select({ id: userCompanies.id })
				.from(userCompanies)
				.where(and(eq(userCompanies.userId, userId), eq(userCompanies.companyId, companyId)));
			if (membership) throw new ApiError(409, 'already_member', 'Pengguna sudah terdaftar di perusahaan ini');
		} else {
			if (!input.password || !input.name) {
				throw new ApiError(422, 'password_required', 'Pengguna baru wajib diberi nama dan password awal (min. 8 karakter)');
			}
			userId = (await createUserWithPassword(tx, { email: input.email, name: input.name, password: input.password })).id;
			created = true;
		}
		await tx.insert(userCompanies).values({ userId, companyId, role: input.role });
		return { userId, created };
	});
}

async function membership(ex: Executor, companyId: string, userId: string) {
	const [row] = await ex
		.select({ id: userCompanies.id, role: userCompanies.role })
		.from(userCompanies)
		.where(and(eq(userCompanies.companyId, companyId), eq(userCompanies.userId, userId)));
	if (!row) throw notFound('Pengguna');
	return row;
}

async function assertNotLastAdmin(ex: Executor, companyId: string, currentRole: Role) {
	if (currentRole !== 'admin') return;
	const [{ admins }] = await ex
		.select({ admins: count() })
		.from(userCompanies)
		.where(and(eq(userCompanies.companyId, companyId), eq(userCompanies.role, 'admin')));
	if (admins <= 1) throw new ApiError(409, 'last_admin', 'Perusahaan harus memiliki minimal satu admin');
}

export async function changeRole(companyId: string, userId: string, role: Role): Promise<void> {
	await db.transaction(async (tx) => {
		const m = await membership(tx, companyId, userId);
		if (role !== 'admin') await assertNotLastAdmin(tx, companyId, m.role);
		await tx.update(userCompanies).set({ role }).where(eq(userCompanies.id, m.id));
	});
}

export async function removeMember(companyId: string, userId: string): Promise<void> {
	await db.transaction(async (tx) => {
		const m = await membership(tx, companyId, userId);
		await assertNotLastAdmin(tx, companyId, m.role);
		await tx.delete(userCompanies).where(eq(userCompanies.id, m.id));
	});
}

export async function setSuperAdmin(actorId: string, userId: string, value: boolean): Promise<void> {
	if (actorId === userId) throw new ApiError(409, 'cannot_change_self', 'Anda tidak dapat mengubah status super admin diri sendiri');
	const updated = await db.update(user).set({ isSuperAdmin: value }).where(eq(user.id, userId)).returning({ id: user.id });
	if (updated.length === 0) throw notFound('Pengguna');
}
