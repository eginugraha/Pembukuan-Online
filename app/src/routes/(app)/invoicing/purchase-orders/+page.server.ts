import { listSigners } from '$lib/server/company/signers';
import { listPurchaseOrders } from '$lib/server/invoicing/purchase-orders';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const [purchaseOrders, signers] = await Promise.all([listPurchaseOrders(ctx.companyId), listSigners(ctx.companyId)]);
	return { purchaseOrders, signers };
};
