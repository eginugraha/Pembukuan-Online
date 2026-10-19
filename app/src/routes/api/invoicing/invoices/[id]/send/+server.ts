import { json } from '@sveltejs/kit';
import { sendInvoice } from '$lib/server/invoicing/invoices';
import { SendInvoiceInput } from '$lib/schemas/invoice';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, SendInvoiceInput);
		await sendInvoice(ctx.companyId, ctx.user.id, parseId(event.params.id, 'Invoice'), input.date);
		return json({ ok: true });
	});
