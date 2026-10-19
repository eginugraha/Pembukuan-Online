import { json } from '@sveltejs/kit';
import { createPurchaseOrder, CreatePurchaseOrderInput, listPurchaseOrders } from '$lib/server/invoicing/purchase-orders';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json({ purchaseOrders: await listPurchaseOrders(ctx.companyId) });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, CreatePurchaseOrderInput);
		return json(await createPurchaseOrder(ctx.companyId, ctx.user.id, input), { status: 201 });
	});
