import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { getOpening, OpeningInput, saveOpening } from '$lib/server/journal/opening';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json({ opening: await getOpening(ctx.companyId) });
	});

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, OpeningInput);
		return json(await saveOpening(ctx.companyId, ctx.user.id, input));
	});
