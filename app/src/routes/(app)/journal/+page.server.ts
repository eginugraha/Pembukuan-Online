import { monthRange, todayIso } from '$lib/dates';
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
		return { from, to, ...(await listJournal(ctx.companyId, from, to)) };
	});
};
