import { eq } from 'drizzle-orm';
import { listAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/db/schema';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'admin');
	const [accounts, company] = await Promise.all([listAccounts(db, ctx.companyId), db.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) })]);
	return { accounts, bankAccountId: company?.bankAccountId ?? null };
};
