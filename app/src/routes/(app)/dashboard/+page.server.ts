import { todayIso } from '$lib/dates';
import { requirePageRole } from '$lib/server/rbac';
import { getDashboard } from '$lib/server/reports/dashboard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const { shell } = await event.parent();
	return { dash: await getDashboard(ctx.companyId, ctx.role, todayIso(), shell ?? undefined) };
};
