import { json } from '@sveltejs/kit';
import { createAdvanceReceipt, CreateAdvanceReceiptInput, listAdvanceReceipts } from '$lib/server/invoicing/advance-receipts';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json({ advanceReceipts: await listAdvanceReceipts(ctx.companyId) });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, CreateAdvanceReceiptInput);
		return json(await createAdvanceReceipt(ctx.companyId, ctx.user.id, input), { status: 201 });
	});
