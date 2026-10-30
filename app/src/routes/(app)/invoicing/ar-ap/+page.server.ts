import { listArAp } from '$lib/server/arap/entries';
import { getArApSummary } from '$lib/server/arap/summary';
import { requirePageRole } from '$lib/server/rbac';
import { roleAtLeast } from '$lib/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const tab = event.url.searchParams.get('tab') === 'ap' ? 'ap' : 'ar';
	const [entries, summary] = await Promise.all([
		listArAp(ctx.companyId, tab === 'ap' ? 'AP' : 'AR'),
		getArApSummary(ctx.companyId)
	]);
	return { tab, entries, summary, canWrite: roleAtLeast(ctx.role, 'accountant') };
};
