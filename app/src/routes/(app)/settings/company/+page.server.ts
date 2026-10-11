import { listLeafAccounts } from '$lib/server/accounts/queries';
import { getCompany } from '$lib/server/company/service';
import { db } from '$lib/server/db';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'admin');
	const [company, leaf] = await Promise.all([getCompany(ctx.companyId), listLeafAccounts(db, ctx.companyId)]);
	return {
		company,
		assetAccounts: leaf.filter((a) => a.type === 'ASSET'),
		showNew: ctx.user.isSuperAdmin && event.url.searchParams.get('new') === '1',
		isSuperAdmin: ctx.user.isSuperAdmin
	};
};
