import { error, redirect } from '@sveltejs/kit';
import { minRoleForPath, visibleNav } from '$lib/nav';
import { getNextStep, getShellStats } from '$lib/server/dashboard/next-step';
import { roleAtLeast } from '$lib/roles';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const ctx = locals.ctx;
	if (!ctx) redirect(303, '/login');
	const min = minRoleForPath(url.pathname);
	if (ctx.companyId && min && !roleAtLeast(ctx.role, min)) {
		error(403, 'Anda tidak memiliki akses ke halaman ini');
	}
	// Dihitung sekali di sini; dashboard memakai ulang lewat parent() agar tidak menjalankan query yang sama dua kali.
	const shell = ctx.companyId ? await getShellStats(ctx.companyId) : null;
	const nextStep = ctx.companyId && shell ? await getNextStep(ctx.companyId, ctx.role, shell) : null;
	return { ctx, nav: visibleNav(ctx.role), nextStep, shell };
};
