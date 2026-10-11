import { monthRange, todayIso } from '$lib/dates';
import { listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { getLedger } from '$lib/server/reports/ledger';
import { dateParam, uuidSchema } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const accounts = await listLeafAccounts(db, ctx.companyId);
	const month = monthRange(todayIso());
	return withPageErrors(async () => {
		const from = dateParam(event.url, 'from') ?? month.from;
		const to = dateParam(event.url, 'to') ?? month.to;
		const accountParam = uuidSchema.safeParse(event.url.searchParams.get('account_id'));
		const ledger = accountParam.success ? await getLedger(ctx.companyId, accountParam.data, from, to) : null;
		return { accounts, from, to, accountId: accountParam.success ? accountParam.data : '', ledger };
	});
};
