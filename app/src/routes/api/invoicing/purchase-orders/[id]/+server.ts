import { json } from '@sveltejs/kit';
import { deletePurchaseOrder, getPurchaseOrder, updatePurchaseOrder, UpdatePurchaseOrderInput } from '$lib/server/invoicing/purchase-orders';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json(await getPurchaseOrder(ctx.companyId, parseId(event.params.id, 'PO')));
	});

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await updatePurchaseOrder(ctx.companyId, parseId(event.params.id, 'PO'), await parseJson(event.request, UpdatePurchaseOrderInput));
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await deletePurchaseOrder(ctx.companyId, parseId(event.params.id, 'PO'));
		return json({ ok: true });
	});
