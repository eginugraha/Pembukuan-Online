import { getContact } from '$lib/server/invoicing/contacts';
import { INVOICE_MARGIN, drawPurchaseOrderPdf } from '$lib/server/invoicing/invoice-pdf';
import { getPurchaseOrder } from '$lib/server/invoicing/purchase-orders';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getInvoiceCompanyData } from '$lib/server/reports/company';
import { createPdfDocument, finishPdf, pdfResponse } from '$lib/server/reports/pdf-scaffold';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const po = await getPurchaseOrder(ctx.companyId, parseId(event.params.id, 'PO'));
		const [contact, company] = await Promise.all([getContact(ctx.companyId, po.contactId), getInvoiceCompanyData(ctx.companyId)]);

		const doc = createPdfDocument({ margin: INVOICE_MARGIN });
		drawPurchaseOrderPdf(doc, { company, contact, po });

		const buf = await finishPdf(doc);
		return pdfResponse(buf, `po-${po.poNo.replaceAll('/', '-')}.pdf`);
	});
