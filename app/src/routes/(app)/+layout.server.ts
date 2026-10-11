import { error, redirect } from '@sveltejs/kit';
import { minRoleForPath, visibleNav } from '$lib/nav';
import { roleAtLeast } from '$lib/roles';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx;
	if (!ctx) redirect(303, '/login');
	const min = minRoleForPath(url.pathname);
	if (ctx.companyId && min && !roleAtLeast(ctx.role, min)) {
		error(403, 'Anda tidak memiliki akses ke halaman ini');
	}
	return { ctx, nav: visibleNav(ctx.role) };
};
