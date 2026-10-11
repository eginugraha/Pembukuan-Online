import { roleAtLeast } from '$lib/roles';
import { listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requirePageRole } from '$lib/server/rbac';
import { listRules } from '$lib/server/rules/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const [rules, accounts] = await Promise.all([listRules(ctx.companyId), listLeafAccounts(db, ctx.companyId)]);
	const company = await db.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) });
	return {
		rules,
		// Akun bank perusahaan bukan target rule yang valid (akan menjadi Dr Bank / Cr Bank).
		accounts: accounts.filter((a) => a.id !== company?.bankAccountId),
		canDelete: roleAtLeast(ctx.role, 'admin')
	};
};
