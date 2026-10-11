import { listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { getOpening } from '$lib/server/journal/opening';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const [accounts, opening] = await Promise.all([listLeafAccounts(db, ctx.companyId), getOpening(ctx.companyId)]);
	return { accounts, opening };
};
