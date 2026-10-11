import { listAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'admin');
	return { accounts: await listAccounts(db, ctx.companyId) };
};
