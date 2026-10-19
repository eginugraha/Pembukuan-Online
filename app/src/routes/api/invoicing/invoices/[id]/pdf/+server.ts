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

const STATUS_LABELS = { DRAFT: 'Draft', SENT: 'Terkirim', PAID: 'Lunas', CANCELLED: 'Dibatalkan' } as const;

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const invoice = await getInvoice(ctx.companyId, parseId(event.params.id, 'Invoice'));
		const [contact, company] = await Promise.all([getContact(ctx.companyId, invoice.contactId), getCompanyLetterheadData(ctx.companyId)]);

		const doc = createPdfDocument();
		const y = drawLetterhead(doc, company, 'INVOICE', `${invoice.invoiceNo ?? 'DRAFT'} — ${formatDate(invoice.issueDate)}`);
		drawDocumentPdf(doc, y, {
			contact,
			lines: invoice.lines,
			subtotal: invoice.subtotal,
			taxRate: invoice.taxRate,
			taxAmount: invoice.taxAmount,
			total: invoice.total,
			notes: invoice.notes,
			statusLabel: STATUS_LABELS[invoice.status]
		});

		const buf = await finishPdf(doc);
		return pdfResponse(buf, `invoice-${invoice.invoiceNo ?? invoice.id}.pdf`);
	});
