import { listContacts } from '$lib/server/invoicing/contacts';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	return { contacts: await listContacts(ctx.companyId, { kind: 'CUSTOMER', activeOnly: true }) };
};
