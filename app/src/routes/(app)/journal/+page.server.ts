import { eq } from 'drizzle-orm';
import { monthRange, todayIso } from '$lib/dates';
import { roleAtLeast } from '$lib/roles';
import { listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/db/schema';
import { listJournal } from '$lib/server/journal/queries';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { dateParam } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const month = monthRange(todayIso());
	return withPageErrors(async () => {
		const from = dateParam(event.url, 'from') ?? month.from;
		const to = dateParam(event.url, 'to') ?? month.to;
		const canEdit = roleAtLeast(ctx.role, 'accountant');
		// Akun tujuan koreksi: akun detail aktif selain akun bank (sama seperti aturan Review).
		const [company, leaf] = canEdit
			? await Promise.all([db.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) }), listLeafAccounts(db, ctx.companyId)])
			: [null, []];
		return {
			from,
			to,
			canEdit,
			accounts: leaf.filter((a) => a.id !== company?.bankAccountId),
			...(await listJournal(ctx.companyId, from, to))
		};
	});
};
