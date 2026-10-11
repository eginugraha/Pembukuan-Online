import { listAccounts, listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/db/schema';
import { requirePageRole } from '$lib/server/rbac';
import { listTransactions } from '$lib/server/transactions/queries';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const company = await db.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) });
	const [transactions, leaf, all] = await Promise.all([
		listTransactions(ctx.companyId, { pendingOnly: true }),
		listLeafAccounts(db, ctx.companyId),
		listAccounts(db, ctx.companyId)
	]);
	return {
		transactions,
		accounts: leaf.filter((a) => a.id !== company?.bankAccountId),
		parents: all.filter((a) => a.isActive && !a.isLeaf).map((a) => ({ id: a.id, code: a.code, name: a.name }))
	};
};
