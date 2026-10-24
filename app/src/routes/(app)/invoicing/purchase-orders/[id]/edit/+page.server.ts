import { getContact, listContacts } from '$lib/server/invoicing/contacts';
import { getPurchaseOrder } from '$lib/server/invoicing/purchase-orders';
import { requirePageRole } from '$lib/server/rbac';
import { withPageErrors } from '$lib/server/page';
import { parseId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const po = await withPageErrors(() => getPurchaseOrder(ctx.companyId, parseId(event.params.id, 'PO')));
	const contacts = await listContacts(ctx.companyId, { kind: 'VENDOR', activeOnly: true });
	// Kontak dokumen ini tetap harus bisa dipilih walau sudah dihapus/nonaktif sejak dokumen dibuat.
	if (!contacts.some((c) => c.id === po.contactId)) {
		contacts.push(await withPageErrors(() => getContact(ctx.companyId, po.contactId)));
	}
	return { po, contacts };
};
