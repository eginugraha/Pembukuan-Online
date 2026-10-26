import { error, redirect } from '@sveltejs/kit';
import { listAllUsers } from '$lib/server/users/admin';
import type { PageServerLoad } from './$types';

// Sengaja tidak memakai requirePageRole: Super Admin tanpa perusahaan aktif harus tetap bisa membuka halaman ini.
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = locals.ctx;
	if (!ctx) redirect(303, '/login');
	if (!ctx.user.isSuperAdmin) error(403, 'Hanya super admin yang dapat membuka halaman ini');
	return {
		users: await listAllUsers(),
		// Untuk Super Admin, ctx.companies memuat semua perusahaan.
		companies: ctx.companies.map((c) => ({ id: c.id, name: c.name })),
		me: ctx.user.id
	};
};
