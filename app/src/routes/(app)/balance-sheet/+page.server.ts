import { monthRange, todayIso } from '$lib/dates';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { getBalanceSheet } from '$lib/server/reports/balance-sheet';
import { dateParam } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return withPageErrors(async () => {
		const asOf = dateParam(event.url, 'as_of') ?? monthRange(todayIso()).to;
		return { bs: await getBalanceSheet(ctx.companyId, asOf) };
	});
};
