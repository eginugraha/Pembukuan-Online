import { redirect } from '@sveltejs/kit';
import { notFound } from '$lib/server/api';
import { getCompany } from '$lib/server/company/service';
import { listContacts } from '$lib/server/invoicing/contacts';
import { getTermPrefill } from '$lib/server/arap/entries';
import { roleAtLeast } from '$lib/roles';
import { requirePageRole } from '$lib/server/rbac';
import { withPageErrors } from '$lib/server/page';
import { parseId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	// ?termId= : dibuat dari termin AR/AP; dokumen baru ditautkan ke termin saat disimpan.
	// Termin tidak valid / bukan AP / bukan milik perusahaan -> 404.
	const rawTermId = event.url.searchParams.get('termId');
	const termId = rawTermId === null ? null : await withPageErrors(async () => parseId(rawTermId, 'Termin'));
	const prefill = termId
		? await withPageErrors(async () => {
				const p = await getTermPrefill(ctx.companyId, termId);
				if (p.kind !== 'AP') throw notFound('Termin');
				return p;
			})
		: null;
	if (prefill?.linked) redirect(303, `/invoicing/ar-ap/${prefill.entryId}`);
	const [contacts, company] = await Promise.all([
		listContacts(ctx.companyId, { kind: 'VENDOR', activeOnly: true }),
		getCompany(ctx.companyId)
	]);
	return {
		contacts: contacts.map((c) => ({ id: c.id, name: c.name, code: c.code })),
		companyCode: company.code,
		canEditCompany: roleAtLeast(ctx.role, 'admin'),
		prefill,
		termId
	};
};
