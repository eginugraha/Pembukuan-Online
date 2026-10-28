import { listSigners } from '$lib/server/company/signers';
import { getContact } from '$lib/server/invoicing/contacts';
import { getQuotation } from '$lib/server/invoicing/quotations';
import { requirePageRole } from '$lib/server/rbac';
import { withPageErrors } from '$lib/server/page';
import { parseId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const quotation = await withPageErrors(() => getQuotation(ctx.companyId, parseId(event.params.id, 'Penawaran')));
	const contact = await withPageErrors(() => getContact(ctx.companyId, quotation.contactId));
	return { quotation, contact, signers: await listSigners(ctx.companyId) };
};
