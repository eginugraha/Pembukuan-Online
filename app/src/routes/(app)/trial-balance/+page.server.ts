import { monthRange, todayIso } from '$lib/dates';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { getTrialBalance } from '$lib/server/reports/trial-balance';
import { dateParam } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return withPageErrors(async () => {
		const asOf = dateParam(event.url, 'as_of') ?? monthRange(todayIso()).to;
		// Task 3: replaced by a real period range
		return { tb: await getTrialBalance(ctx.companyId, { from: '1900-01-01', to: asOf }) };
	});
};
