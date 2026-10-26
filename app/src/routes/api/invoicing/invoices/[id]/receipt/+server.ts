import { json } from '@sveltejs/kit';
import { deletePaymentReceipt, getPaymentReceiptForInvoice, issuePaymentReceipt } from '$lib/server/invoicing/payment-receipts';
import { IssuePaymentReceiptInput } from '$lib/schemas/payment-receipt';
import { apiHandler, notFound, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const receipt = await getPaymentReceiptForInvoice(ctx.companyId, parseId(event.params.id, 'Invoice'));
		if (!receipt) throw notFound('Receipt');
		return json(receipt);
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, IssuePaymentReceiptInput);
		return json(await issuePaymentReceipt(ctx.companyId, ctx.user.id, parseId(event.params.id, 'Invoice'), input), { status: 201 });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await deletePaymentReceipt(ctx.companyId, parseId(event.params.id, 'Invoice'));
		return json({ ok: true });
	});
