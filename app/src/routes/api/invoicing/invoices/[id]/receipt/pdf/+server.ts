import { signerForDownload } from '$lib/server/company/signers';
import { paymentReceipts } from '$lib/server/db/schema';
import { getPaymentReceiptForInvoice } from '$lib/server/invoicing/payment-receipts';
import { INVOICE_MARGIN, drawReceiptPdf } from '$lib/server/invoicing/invoice-pdf';
import { apiHandler, notFound } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getInvoiceCompanyData } from '$lib/server/reports/company';
import { createPdfDocument, finishPdf, pdfResponse } from '$lib/server/reports/pdf-scaffold';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const invoiceId = parseId(event.params.id, 'Invoice');
		// Receipt adalah salinan tetap; hanya data perusahaan yang dibaca saat PDF dibuat.
		const receipt = await getPaymentReceiptForInvoice(ctx.companyId, invoiceId);
		if (!receipt) throw notFound('Receipt');
		const signerId = await signerForDownload(ctx.companyId, paymentReceipts, receipt, event.url.searchParams.get('signer'));
		const company = await getInvoiceCompanyData(ctx.companyId, signerId);

		// bufferPages: stempel LUNAS digambar di atas konten setiap halaman setelah semua halaman selesai.
		const doc = createPdfDocument({ margin: INVOICE_MARGIN, bufferPages: true });
		drawReceiptPdf(doc, { company, receipt });

		const buf = await finishPdf(doc);
		return pdfResponse(buf, `receipt-${receipt.receiptNo.replaceAll('/', '-')}.pdf`);
	});
