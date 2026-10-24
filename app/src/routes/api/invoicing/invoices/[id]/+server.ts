import { json } from '@sveltejs/kit';
import { deleteInvoice, getInvoice, updateInvoice, UpdateInvoiceInput } from '$lib/server/invoicing/invoices';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json(await getInvoice(ctx.companyId, parseId(event.params.id, 'Invoice')));
	});

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await updateInvoice(ctx.companyId, parseId(event.params.id, 'Invoice'), await parseJson(event.request, UpdateInvoiceInput));
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await deleteInvoice(ctx.companyId, parseId(event.params.id, 'Invoice'));
		return json({ ok: true });
	});
