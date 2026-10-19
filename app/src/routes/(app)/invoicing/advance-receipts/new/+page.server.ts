import { listContacts } from '$lib/server/invoicing/contacts';
import { listLeafAccounts } from '$lib/server/accounts/queries';
import { db } from '$lib/server/db';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const [contacts, accounts] = await Promise.all([
		listContacts(ctx.companyId, { kind: 'CUSTOMER' }),
		listLeafAccounts(db, ctx.companyId)
	]);
	return { contacts, accounts };
};
