import { listSigners } from '$lib/server/company/signers';
import { listQuotations } from '$lib/server/invoicing/quotations';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const [quotations, signers] = await Promise.all([listQuotations(ctx.companyId), listSigners(ctx.companyId)]);
	return { quotations, signers };
};
