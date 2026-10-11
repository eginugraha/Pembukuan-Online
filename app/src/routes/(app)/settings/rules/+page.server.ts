import { roleAtLeast } from '$lib/roles';
import { listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { requirePageRole } from '$lib/server/rbac';
import { listRules } from '$lib/server/rules/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const [rules, accounts] = await Promise.all([listRules(ctx.companyId), listLeafAccounts(db, ctx.companyId)]);
	return { rules, accounts, canDelete: roleAtLeast(ctx.role, 'admin') };
};
