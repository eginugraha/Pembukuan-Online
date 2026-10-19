import { json } from '@sveltejs/kit';
import { payInvoiceByAdvanceReceipt, payInvoiceByBank } from '$lib/server/invoicing/invoices';
import { PayInvoiceInput } from '$lib/schemas/invoice';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, PayInvoiceInput);
		const invoiceId = parseId(event.params.id, 'Invoice');
		if (input.method === 'ADVANCE_RECEIPT') {
			await payInvoiceByAdvanceReceipt(ctx.companyId, ctx.user.id, invoiceId, input.advanceReceiptId, input.date);
		} else {
			await payInvoiceByBank(ctx.companyId, ctx.user.id, invoiceId, input.date);
		}
		return json({ ok: true });
	});
