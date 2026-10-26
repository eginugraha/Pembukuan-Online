import { getContact } from '$lib/server/invoicing/contacts';
import { getInvoice } from '$lib/server/invoicing/invoices';
import { drawInvoicePdf } from '$lib/server/invoicing/invoice-pdf';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getInvoiceCompanyData } from '$lib/server/reports/company';
import { createPdfDocument, finishPdf, pdfResponse } from '$lib/server/reports/pdf-scaffold';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const invoice = await getInvoice(ctx.companyId, parseId(event.params.id, 'Invoice'));
		const [contact, company] = await Promise.all([getContact(ctx.companyId, invoice.contactId), getInvoiceCompanyData(ctx.companyId)]);

		const doc = createPdfDocument();
		drawInvoicePdf(doc, { company, contact, invoice });

		const buf = await finishPdf(doc);
		return pdfResponse(buf, `invoice-${invoice.invoiceNo.replaceAll('/', '-')}.pdf`);
	});
