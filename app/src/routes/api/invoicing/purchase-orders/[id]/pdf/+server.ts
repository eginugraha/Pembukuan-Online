import { formatDate } from '$lib/dates';
import { getContact } from '$lib/server/invoicing/contacts';
import { getPurchaseOrder } from '$lib/server/invoicing/purchase-orders';
import { drawDocumentPdf } from '$lib/server/invoicing/pdf';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { createPdfDocument, finishPdf, pdfResponse } from '$lib/server/reports/pdf-scaffold';
import { drawLetterhead, getCompanyLetterheadData } from '$lib/server/reports/pdf-letterhead';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const po = await getPurchaseOrder(ctx.companyId, parseId(event.params.id, 'PO'));
		const [contact, company] = await Promise.all([getContact(ctx.companyId, po.contactId), getCompanyLetterheadData(ctx.companyId)]);

		const doc = createPdfDocument();
		const y = drawLetterhead(doc, company, 'PURCHASE ORDER', `${po.poNo ?? 'DRAFT'} — ${formatDate(po.issueDate)}`);
		drawDocumentPdf(doc, y, {
			contact,
			lines: po.lines,
			subtotal: po.subtotal,
			taxRate: po.taxRate,
			taxAmount: po.taxAmount,
			total: po.total,
			notes: po.notes
		});

		const buf = await finishPdf(doc);
		return pdfResponse(buf, `po-${po.poNo ?? po.id}.pdf`);
	});
