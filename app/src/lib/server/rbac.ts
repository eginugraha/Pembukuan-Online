import { error, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { roleAtLeast, type Role } from '../roles';
import { ApiError } from './api';
import { db } from './db';
import { companies, userCompanies } from './db/schema';

export type { Role } from '../roles';

export const COMPANY_COOKIE = 'jk_company';

export interface SessionUser {
	id: string;
	email: string;
	name: string;
	isSuperAdmin: boolean;
	/** URL foto profil (/api/users/:id/avatar?v=…) atau null. */
	image?: string | null;
}
export interface CompanyMembership {
	id: string;
	name: string;
	role: Role;
}
export interface AppContext {
	user: SessionUser;
	companies: CompanyMembership[];
	companyId: string | null;
	role: Role | null;
}
export interface ActiveContext extends AppContext {
	companyId: string;
	role: Role;
}

interface HasLocals {
	locals: { ctx: AppContext | null };
}

export async function resolveContext(user: SessionUser, requestedCompanyId?: string | null): Promise<AppContext> {
	const memberships: CompanyMembership[] = user.isSuperAdmin
		? (
				await db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(asc(companies.name))
			).map((c) => ({ ...c, role: 'admin' as const }))
		: await db
				.select({ id: companies.id, name: companies.name, role: userCompanies.role })
				.from(userCompanies)
				.innerJoin(companies, eq(companies.id, userCompanies.companyId))
				.where(eq(userCompanies.userId, user.id))
				.orderBy(asc(companies.name));
	const active = memberships.find((c) => c.id === requestedCompanyId) ?? memberships[0] ?? null;
	return { user, companies: memberships, companyId: active?.id ?? null, role: active?.role ?? null };
}

export function requireUser(event: HasLocals): AppContext {
	const ctx = event.locals.ctx;
	if (!ctx) throw new ApiError(401, 'unauthenticated', 'Silakan login terlebih dahulu');
	return ctx;
}

export function requireCompany(event: HasLocals): ActiveContext {
	const ctx = requireUser(event);
	if (!ctx.companyId || !ctx.role) {
		throw new ApiError(409, 'no_company', 'Akun Anda belum terhubung ke perusahaan');
	}
	return ctx as ActiveContext;
}

export function requireRole(event: HasLocals, min: Role): ActiveContext {
	const ctx = requireCompany(event);
	if (!roleAtLeast(ctx.role, min)) {
		throw new ApiError(403, 'forbidden', 'Anda tidak memiliki akses untuk tindakan ini');
	}
	return ctx;
}

export function requireSuperAdmin(event: HasLocals): AppContext {
	const ctx = requireUser(event);
	if (!ctx.user.isSuperAdmin) {
		throw new ApiError(403, 'forbidden', 'Hanya super admin yang dapat melakukan tindakan ini');
	}
	return ctx;
}

/** Versi untuk load function halaman: 401 → redirect login, lainnya → halaman error SvelteKit. */
export function requirePageRole(event: HasLocals, min: Role): ActiveContext {
	try {
		return requireRole(event, min);
	} catch (e) {
		if (e instanceof ApiError) {
			if (e.status === 401) redirect(303, '/login');
			error(e.status, e.message);
		}
		throw e;
	}
}
