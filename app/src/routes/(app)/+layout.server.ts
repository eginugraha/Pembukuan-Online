import { error, redirect } from '@sveltejs/kit';
import { minRoleForPath, visibleNav } from '$lib/nav';
import { getNextStep } from '$lib/server/dashboard/next-step';
import { roleAtLeast } from '$lib/roles';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const ctx = locals.ctx;
	if (!ctx) redirect(303, '/login');
	const min = minRoleForPath(url.pathname);
	if (ctx.companyId && min && !roleAtLeast(ctx.role, min)) {
		error(403, 'Anda tidak memiliki akses ke halaman ini');
	}
	const nextStep = ctx.companyId ? await getNextStep(ctx.companyId, ctx.role) : null;
	return { ctx, nav: visibleNav(ctx.role), nextStep };
};
