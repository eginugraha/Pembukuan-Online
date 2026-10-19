import { json } from '@sveltejs/kit';
import { createInvoice, CreateInvoiceInput, listInvoices } from '$lib/server/invoicing/invoices';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json({ invoices: await listInvoices(ctx.companyId) });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, CreateInvoiceInput);
		return json(await createInvoice(ctx.companyId, ctx.user.id, input), { status: 201 });
	});
