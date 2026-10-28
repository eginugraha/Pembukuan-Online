import { listSigners } from '$lib/server/company/signers';
import { getPurchaseOrder } from '$lib/server/invoicing/purchase-orders';
import { getContact } from '$lib/server/invoicing/contacts';
import { requirePageRole } from '$lib/server/rbac';
import { withPageErrors } from '$lib/server/page';
import { parseId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const po = await withPageErrors(() => getPurchaseOrder(ctx.companyId, parseId(event.params.id, 'PO')));
	const contact = await withPageErrors(() => getContact(ctx.companyId, po.contactId));
	return { po, contact, signers: await listSigners(ctx.companyId) };
};
