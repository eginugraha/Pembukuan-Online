import { and, asc, eq, isNull } from 'drizzle-orm';
import { IssuePaymentReceiptInput } from '../../schemas/payment-receipt';
import { ApiError, notFound } from '../api';
import { db } from '../db';
import { isUniqueViolation } from '../db/errors';
import { contacts, invoiceLines, invoices, paymentReceiptLines, paymentReceipts } from '../db/schema';
import { nextDocumentNumber, requireCompanyCode, requireContactCode } from './numbering';

export { IssuePaymentReceiptInput };

export interface PaymentReceiptLineRow {
	id: string;
	lineNo: number;
	description: string;
	quantity: string;
	unitPrice: string;
	amount: string;
}

export interface PaymentReceiptDetail {
	id: string;
	companyId: string;
	invoiceId: string;
	receiptNo: string;
	paymentDate: string;
	invoiceNo: string;
	subject: string | null;
	currency: string;
	subtotal: string;
	discount: string;
	taxRate: string | null;
	taxAmount: string;
	total: string;
	notes: string | null;
	contact: {
		name: string;
		attention: string | null;
		position: string | null;
		address: string | null;
		email: string | null;
		phone: string | null;
		npwp: string | null;
	};
	lines: PaymentReceiptLineRow[];
	createdAt: Date;
}

const ACTIVE_INVOICE_UQ = 'payment_receipts_active_invoice_uq';
const receiptExists = () => new ApiError(409, 'receipt_exists', 'Invoice ini sudah punya receipt');

/**
 * Terbitkan receipt dari invoice: nomor `NNN/<PERUSAHAAN>-<KONTAK>/RCP/<BULAN>/<TAHUN>` dari tanggal pembayaran,
 * lalu salin data kontak, baris, dan nominal invoice saat ini. Tidak ada jurnal dan invoice tidak berubah.
 * Satu receipt aktif per invoice dijamin oleh indeks unik parsial; penerbitan bersamaan yang kalah mendapat 409
 * dan transaksinya (termasuk kenaikan counter) dibatalkan.
 */
export async function issuePaymentReceipt(
	companyId: string,
	userId: string,
	invoiceId: string,
	input: IssuePaymentReceiptInput
): Promise<{ id: string }> {
	try {
		return await db.transaction(async (tx) => {
			// FOR UPDATE: berurutan dengan deleteInvoice, supaya invoice tidak terhapus di tengah penerbitan.
			const [invoice] = await tx
				.select()
				.from(invoices)
				.where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId), isNull(invoices.deletedAt)))
				.limit(1)
				.for('update');
			if (!invoice) throw notFound('Invoice');
			const existing = await tx
				.select({ id: paymentReceipts.id })
				.from(paymentReceipts)
				.where(and(eq(paymentReceipts.invoiceId, invoiceId), isNull(paymentReceipts.deletedAt)))
				.limit(1);
			if (existing.length > 0) throw receiptExists();
			const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.lineNo));

			const companyCode = await requireCompanyCode(tx, companyId);
			// Sengaja tanpa saring deletedAt/isActive: invoice tetap bisa diproses walau kontaknya sudah dihapus.
			const [contact] = await tx
				.select()
				.from(contacts)
				.where(and(eq(contacts.id, invoice.contactId), eq(contacts.companyId, companyId)))
				.limit(1);
			if (!contact) throw notFound('Kontak');
			const contactCode = requireContactCode(contact.code);
			const receiptNo = await nextDocumentNumber(tx, companyId, { kind: 'RCP', issueDate: input.paymentDate, companyCode, contactCode });

			const [row] = await tx
				.insert(paymentReceipts)
				.values({
					companyId,
					invoiceId,
					receiptNo,
					paymentDate: input.paymentDate,
					invoiceNo: invoice.invoiceNo,
					subject: invoice.subject,
					currency: invoice.currency,
					subtotal: invoice.subtotal,
					discount: invoice.discount,
					taxRate: invoice.taxRate,
					taxAmount: invoice.taxAmount,
					total: invoice.total,
					notes: invoice.notes,
					contactName: contact.name,
					contactAttention: contact.attention,
					contactPosition: contact.position,
					contactAddress: contact.address,
					contactEmail: contact.email,
					contactPhone: contact.phone,
					contactNpwp: contact.npwp,
					createdBy: userId
				})
				.returning({ id: paymentReceipts.id });
			if (lines.length > 0) {
				await tx.insert(paymentReceiptLines).values(
					lines.map((l) => ({
						receiptId: row.id,
						lineNo: l.lineNo,
						description: l.description,
						quantity: l.quantity,
						unitPrice: l.unitPrice,
						amount: l.amount
					}))
				);
			}
			return { id: row.id };
		});
	} catch (e) {
		if (isUniqueViolation(e, ACTIVE_INVOICE_UQ)) throw receiptExists();
		throw e;
	}
}

/** Receipt aktif milik invoice ini, atau `null` bila belum ada (atau sudah dihapus). */
export async function getPaymentReceiptForInvoice(companyId: string, invoiceId: string): Promise<PaymentReceiptDetail | null> {
	const [r] = await db
		.select()
		.from(paymentReceipts)
		.where(and(eq(paymentReceipts.invoiceId, invoiceId), eq(paymentReceipts.companyId, companyId), isNull(paymentReceipts.deletedAt)))
		.limit(1);
	if (!r) return null;
	const lines = await db
		.select({
			id: paymentReceiptLines.id,
			lineNo: paymentReceiptLines.lineNo,
			description: paymentReceiptLines.description,
			quantity: paymentReceiptLines.quantity,
			unitPrice: paymentReceiptLines.unitPrice,
			amount: paymentReceiptLines.amount
		})
		.from(paymentReceiptLines)
		.where(eq(paymentReceiptLines.receiptId, r.id))
		.orderBy(asc(paymentReceiptLines.lineNo));
	return {
		id: r.id,
		companyId: r.companyId,
		invoiceId: r.invoiceId,
		receiptNo: r.receiptNo,
		paymentDate: r.paymentDate,
		invoiceNo: r.invoiceNo,
		subject: r.subject,
		currency: r.currency,
		subtotal: r.subtotal,
		discount: r.discount,
		taxRate: r.taxRate,
		taxAmount: r.taxAmount,
		total: r.total,
		notes: r.notes,
		contact: {
			name: r.contactName,
			attention: r.contactAttention,
			position: r.contactPosition,
			address: r.contactAddress,
			email: r.contactEmail,
			phone: r.contactPhone,
			npwp: r.contactNpwp
		},
		lines,
		createdAt: r.createdAt
	};
}

/** Soft delete receipt aktif: nomornya tidak dipakai ulang, dan invoice boleh menerbitkan receipt baru. */
export async function deletePaymentReceipt(companyId: string, invoiceId: string): Promise<void> {
	const deleted = await db
		.update(paymentReceipts)
		.set({ deletedAt: new Date() })
		.where(and(eq(paymentReceipts.invoiceId, invoiceId), eq(paymentReceipts.companyId, companyId), isNull(paymentReceipts.deletedAt)))
		.returning({ id: paymentReceipts.id });
	if (deleted.length === 0) throw notFound('Receipt');
}
