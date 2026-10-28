import { listSigners } from '$lib/server/company/signers';
import { listInvoices } from '$lib/server/invoicing/invoices';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const [invoices, signers] = await Promise.all([listInvoices(ctx.companyId), listSigners(ctx.companyId)]);
	return { invoices, signers };
};
