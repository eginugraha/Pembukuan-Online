import { json } from '@sveltejs/kit';
import { monthRange, todayIso } from '$lib/dates';
import { apiHandler } from '$lib/server/api';
import { listJournal } from '$lib/server/journal/queries';
import { requireRole } from '$lib/server/rbac';
import { dateParam } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const month = monthRange(todayIso());
		const from = dateParam(event.url, 'from') ?? month.from;
		const to = dateParam(event.url, 'to') ?? month.to;
		return json({ from, to, ...(await listJournal(ctx.companyId, from, to)) });
	});
