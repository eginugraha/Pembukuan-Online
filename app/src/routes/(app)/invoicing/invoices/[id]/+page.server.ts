import { getInvoice } from '$lib/server/invoicing/invoices';
import { getContact } from '$lib/server/invoicing/contacts';
import { requirePageRole } from '$lib/server/rbac';
import { withPageErrors } from '$lib/server/page';
import { parseId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const invoice = await withPageErrors(() => getInvoice(ctx.companyId, parseId(event.params.id, 'Invoice')));
	const contact = await withPageErrors(() => getContact(ctx.companyId, invoice.contactId));
	return { invoice, contact };
};
