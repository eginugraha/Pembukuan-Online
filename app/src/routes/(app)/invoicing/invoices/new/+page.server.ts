import { getCompany } from '$lib/server/company/service';
import { listContacts } from '$lib/server/invoicing/contacts';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const [contacts, company] = await Promise.all([
		listContacts(ctx.companyId, { kind: 'CUSTOMER', activeOnly: true }),
		getCompany(ctx.companyId)
	]);
	return { contacts: contacts.map((c) => ({ id: c.id, name: c.name, code: c.code })), companyCode: company.code };
};
