import { json } from '@sveltejs/kit';
import { cancelPurchaseOrder, getPurchaseOrder } from '$lib/server/invoicing/purchase-orders';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const viewerCtx = requireRole(event, 'viewer');
		const poId = parseId(event.params.id, 'PO');
		const po = await getPurchaseOrder(viewerCtx.companyId, poId);
		const ctx = requireRole(event, po.status === 'RECEIVED' ? 'admin' : 'accountant');
		await cancelPurchaseOrder(ctx.companyId, ctx.user.id, poId);
		return json({ ok: true });
	});
