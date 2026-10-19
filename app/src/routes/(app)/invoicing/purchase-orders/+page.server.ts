import { listPurchaseOrders } from '$lib/server/invoicing/purchase-orders';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return { purchaseOrders: await listPurchaseOrders(ctx.companyId) };
};
