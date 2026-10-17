import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { CloseInput, closeFiscalYear } from '$lib/server/closing/close';
import { listFiscalYears } from '$lib/server/closing/years';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		return json(await listFiscalYears(ctx.companyId));
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		const input = await parseJson(event.request, CloseInput);
		const { journalId } = await closeFiscalYear(ctx.companyId, ctx.user.id, input);
		return json({ journalId }, { status: 201 });
	});
