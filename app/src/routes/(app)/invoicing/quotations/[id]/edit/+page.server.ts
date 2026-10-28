import { redirect } from '@sveltejs/kit';
import { getContact } from '$lib/server/invoicing/contacts';
import { getQuotation } from '$lib/server/invoicing/quotations';
import { requirePageRole } from '$lib/server/rbac';
import { withPageErrors } from '$lib/server/page';
import { parseId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

/** Dipakai halaman Ubah dan Revisi: hanya versi terbaru yang belum disetujui; selain itu kembali ke detail. */
export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'accountant');
	const quotation = await withPageErrors(() => getQuotation(ctx.companyId, parseId(event.params.id, 'Penawaran')));
	if (!quotation.isLatest || quotation.approvedAt) redirect(303, `/invoicing/quotations/${quotation.id}`);
	// Pelanggan terkunci, jadi cukup kontak penawaran ini (walau sudah dihapus/nonaktif).
	const contact = await withPageErrors(() => getContact(ctx.companyId, quotation.contactId));
	return { quotation, contacts: [{ id: contact.id, name: contact.name, code: contact.code }] };
};
