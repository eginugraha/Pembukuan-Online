import { json } from '@sveltejs/kit';
import { issuePurchaseOrder } from '$lib/server/invoicing/purchase-orders';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await issuePurchaseOrder(ctx.companyId, ctx.user.id, parseId(event.params.id, 'PO'));
		return json({ ok: true });
	});
