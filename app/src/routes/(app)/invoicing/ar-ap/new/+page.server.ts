import { listLinkableDocuments } from '$lib/server/arap/entries';
import { listContacts } from '$lib/server/invoicing/contacts';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const kind: 'AR' | 'AP' = event.url.searchParams.get('kind') === 'AP' ? 'AP' : 'AR';
	// `listContacts` dengan `kind` sudah menyertakan kontak BOTH.
	const [contacts, linkable] = await Promise.all([
		listContacts(ctx.companyId, { kind: kind === 'AR' ? 'CUSTOMER' : 'VENDOR', activeOnly: true }),
		listLinkableDocuments(ctx.companyId, kind)
	]);
	return { kind, contacts: contacts.map((c) => ({ id: c.id, name: c.name })), linkable };
};
