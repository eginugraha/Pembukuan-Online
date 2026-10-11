import { json } from '@sveltejs/kit';
import { monthRange, todayIso } from '$lib/dates';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getLedger } from '$lib/server/reports/ledger';
import { dateParam, parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const accountId = parseId(event.url.searchParams.get('account_id'), 'Akun');
		const month = monthRange(todayIso());
		const from = dateParam(event.url, 'from') ?? month.from;
		const to = dateParam(event.url, 'to') ?? month.to;
		return json(await getLedger(ctx.companyId, accountId, from, to));
	});
