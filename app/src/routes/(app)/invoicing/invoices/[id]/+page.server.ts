import { getInvoice } from '$lib/server/invoicing/invoices';
import { getPaymentReceiptForInvoice } from '$lib/server/invoicing/payment-receipts';
import { getContact } from '$lib/server/invoicing/contacts';
import { requirePageRole } from '$lib/server/rbac';
import { withPageErrors } from '$lib/server/page';
import { parseId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const invoiceId = parseId(event.params.id, 'Invoice');
	const invoice = await withPageErrors(() => getInvoice(ctx.companyId, invoiceId));
	const contact = await withPageErrors(() => getContact(ctx.companyId, invoice.contactId));
	const receipt = await withPageErrors(() => getPaymentReceiptForInvoice(ctx.companyId, invoiceId));
	return { invoice, contact, receipt };
};
