import { json } from '@sveltejs/kit';
import { createArAp, CreateArApInput, listArAp } from '$lib/server/arap/entries';
import { getArApSummary } from '$lib/server/arap/summary';
import { ApiError, apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const kind = event.url.searchParams.get('kind');
		if (kind !== 'AR' && kind !== 'AP') {
			throw new ApiError(400, 'validation_error', 'Jenis tidak valid', undefined, { field: 'kind' });
		}
		const [entries, summary] = await Promise.all([listArAp(ctx.companyId, kind), getArApSummary(ctx.companyId)]);
		return json({ entries, summary });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, CreateArApInput);
		return json(await createArAp(ctx.companyId, ctx.user.id, input), { status: 201 });
	});
