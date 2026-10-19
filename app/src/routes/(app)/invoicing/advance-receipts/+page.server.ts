import { listAdvanceReceipts } from '$lib/server/invoicing/advance-receipts';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return { advanceReceipts: await listAdvanceReceipts(ctx.companyId) };
};
