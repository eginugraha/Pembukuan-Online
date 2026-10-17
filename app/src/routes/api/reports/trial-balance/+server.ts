import { json } from '@sveltejs/kit';
import { monthRange, todayIso } from '$lib/dates';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getTrialBalance } from '$lib/server/reports/trial-balance';
import { dateParam } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const asOf = dateParam(event.url, 'as_of') ?? monthRange(todayIso()).to;
		// Task 3: replaced by a real period range
		return json(await getTrialBalance(ctx.companyId, { from: '1900-01-01', to: asOf }));
	});
