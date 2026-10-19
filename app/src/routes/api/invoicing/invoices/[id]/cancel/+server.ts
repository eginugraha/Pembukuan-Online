import { json } from '@sveltejs/kit';
import { cancelInvoice, getInvoice } from '$lib/server/invoicing/invoices';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const viewerCtx = requireRole(event, 'viewer');
		const invoiceId = parseId(event.params.id, 'Invoice');
		const invoice = await getInvoice(viewerCtx.companyId, invoiceId);
		const ctx = requireRole(event, invoice.status === 'DRAFT' ? 'accountant' : 'admin');
		await cancelInvoice(ctx.companyId, ctx.user.id, invoiceId);
		return json({ ok: true });
	});
