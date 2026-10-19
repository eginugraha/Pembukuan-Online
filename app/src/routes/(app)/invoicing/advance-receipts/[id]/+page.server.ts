import { getAdvanceReceipt } from '$lib/server/invoicing/advance-receipts';
import { getContact } from '$lib/server/invoicing/contacts';
import { requirePageRole } from '$lib/server/rbac';
import { withPageErrors } from '$lib/server/page';
import { parseId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const advanceReceipt = await withPageErrors(() => getAdvanceReceipt(ctx.companyId, parseId(event.params.id, 'Uang muka')));
	const contact = await withPageErrors(() => getContact(ctx.companyId, advanceReceipt.contactId));
	return { advanceReceipt, contact };
};
