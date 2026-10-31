import { json } from '@sveltejs/kit';
import { deleteArAp, getArAp, updateArAp, UpdateArApInput } from '$lib/server/arap/entries';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json(await getArAp(ctx.companyId, parseId(event.params.id, 'AR/AP')));
	});

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await updateArAp(ctx.companyId, parseId(event.params.id, 'AR/AP'), await parseJson(event.request, UpdateArApInput));
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await deleteArAp(ctx.companyId, parseId(event.params.id, 'AR/AP'));
		return json({ ok: true });
	});
