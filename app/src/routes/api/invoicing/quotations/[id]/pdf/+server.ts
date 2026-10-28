import { signerForDownload } from '$lib/server/company/signers';
import { quotations } from '$lib/server/db/schema';
import { getContact } from '$lib/server/invoicing/contacts';
import { getQuotation } from '$lib/server/invoicing/quotations';
import { INVOICE_MARGIN, drawQuotationPdf } from '$lib/server/invoicing/invoice-pdf';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getInvoiceCompanyData } from '$lib/server/reports/company';
import { createPdfDocument, finishPdf, pdfResponse } from '$lib/server/reports/pdf-scaffold';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const quotation = await getQuotation(ctx.companyId, parseId(event.params.id, 'Penawaran'));
		const signerId = await signerForDownload(ctx.companyId, quotations, quotation, event.url.searchParams.get('signer'));
		const [contact, company] = await Promise.all([getContact(ctx.companyId, quotation.contactId), getInvoiceCompanyData(ctx.companyId, signerId)]);

		const doc = createPdfDocument({ margin: INVOICE_MARGIN });
		drawQuotationPdf(doc, { company, contact, quotation });

		const buf = await finishPdf(doc);
		return pdfResponse(buf, `quotation-${quotation.quotationNo.replaceAll('/', '-')}.pdf`);
	});
