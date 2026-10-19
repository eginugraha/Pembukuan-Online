import { listInvoices } from '$lib/server/invoicing/invoices';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return { invoices: await listInvoices(ctx.companyId) };
};
