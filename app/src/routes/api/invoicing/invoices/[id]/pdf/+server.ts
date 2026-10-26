import { formatDate } from '$lib/dates';
import { getContact } from '$lib/server/invoicing/contacts';
import { getInvoice } from '$lib/server/invoicing/invoices';
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
		const invoice = await getInvoice(ctx.companyId, parseId(event.params.id, 'Invoice'));
		const [contact, company] = await Promise.all([getContact(ctx.companyId, invoice.contactId), getCompanyLetterheadData(ctx.companyId)]);

		const doc = createPdfDocument();
		const due = invoice.dueDate ? ` — Jatuh tempo ${formatDate(invoice.dueDate)}` : '';
		const y = drawLetterhead(doc, company, 'INVOICE', `${invoice.invoiceNo} — ${formatDate(invoice.issueDate)}${due}`);
		drawDocumentPdf(doc, y, {
			contact,
			lines: invoice.lines,
			subtotal: invoice.subtotal,
			discount: invoice.discount,
			taxRate: invoice.taxRate,
			taxAmount: invoice.taxAmount,
			total: invoice.total,
			notes: invoice.notes
		});

		const buf = await finishPdf(doc);
		return pdfResponse(buf, `invoice-${invoice.invoiceNo}.pdf`);
	});
