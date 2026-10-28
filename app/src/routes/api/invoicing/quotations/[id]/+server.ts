import { json } from '@sveltejs/kit';
import { deleteQuotation, getQuotation, updateQuotation, UpdateQuotationInput } from '$lib/server/invoicing/quotations';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json(await getQuotation(ctx.companyId, parseId(event.params.id, 'Penawaran')));
	});

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await updateQuotation(ctx.companyId, parseId(event.params.id, 'Penawaran'), await parseJson(event.request, UpdateQuotationInput));
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await deleteQuotation(ctx.companyId, parseId(event.params.id, 'Penawaran'));
		return json({ ok: true });
	});
