import { redirect } from '@sveltejs/kit';
import { getContact } from './contacts';
import { getQuotation } from './quotations';
import { requirePageRole, type HasLocals } from '../rbac';
import { withPageErrors } from '../page';
import { parseId } from '../validation';

/** Data halaman Ubah dan Revisi: hanya versi terbaru yang belum disetujui; selain itu kembali ke detail. */
export async function loadQuotationForm(event: HasLocals, id: string) {
	const ctx = requirePageRole(event, 'accountant');
	const quotation = await withPageErrors(() => getQuotation(ctx.companyId, parseId(id, 'Penawaran')));
	if (!quotation.isLatest || quotation.approvedAt) redirect(303, `/invoicing/quotations/${quotation.id}`);
	// Pelanggan terkunci, jadi cukup kontak penawaran ini (walau sudah dihapus/nonaktif).
	const contact = await withPageErrors(() => getContact(ctx.companyId, quotation.contactId));
	return { quotation, contacts: [{ id: contact.id, name: contact.name, code: contact.code }] };
}
