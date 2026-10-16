import { json } from '@sveltejs/kit';
import { monthRange, todayIso } from '$lib/dates';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getBalanceSheet } from '$lib/server/reports/balance-sheet';
import { dateParam } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const asOf = dateParam(event.url, 'as_of') ?? monthRange(todayIso()).to;
		return json(await getBalanceSheet(ctx.companyId, asOf));
	});
