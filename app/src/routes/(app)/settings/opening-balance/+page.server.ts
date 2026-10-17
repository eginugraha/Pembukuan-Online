import { listLeafAccounts } from '$lib/server/accounts/queries';
import { lockedThrough } from '$lib/server/closing/years';
import { db } from '$lib/server/db';
import { getOpening } from '$lib/server/journal/opening';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const [accounts, opening, locked] = await Promise.all([
		listLeafAccounts(db, ctx.companyId),
		getOpening(ctx.companyId),
		lockedThrough(db, ctx.companyId)
	]);
	return { accounts, opening, lockedLabel: locked?.label ?? null };
};
