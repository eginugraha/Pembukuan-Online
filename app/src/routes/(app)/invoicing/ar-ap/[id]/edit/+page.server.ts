import { getArAp, listLinkableDocuments } from '$lib/server/arap/entries';
import { getContact, listContacts } from '$lib/server/invoicing/contacts';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const entry = await withPageErrors(() => getArAp(ctx.companyId, parseId(event.params.id, 'AR/AP')));
	const [contacts, linkable] = await Promise.all([
		listContacts(ctx.companyId, { kind: entry.kind === 'AR' ? 'CUSTOMER' : 'VENDOR', activeOnly: true }),
		// Dokumen yang sudah terhubung ke termin mana pun dari entri ini tetap bisa dipilih.
		listLinkableDocuments(ctx.companyId, entry.kind, { includeEntryId: entry.id })
	]);
	// Kontak entri ini tetap harus bisa dipilih walau sudah dihapus/nonaktif sejak entri dibuat.
	if (!contacts.some((c) => c.id === entry.contactId)) {
		contacts.push(await withPageErrors(() => getContact(ctx.companyId, entry.contactId)));
	}
	return { entry, contacts: contacts.map((c) => ({ id: c.id, name: c.name })), linkable };
};
