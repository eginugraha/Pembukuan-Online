import { and, asc, eq, isNull } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { CreateInvoiceInput, InvoiceLineInput, UpdateInvoiceInput } from '../../schemas/invoice';
import { assertContact } from './contacts';
import { ApiError, notFound } from '../api';
import { db, type Tx } from '../db';
import { contacts, invoiceLines, invoices } from '../db/schema';
import { nextDocumentNumber, requireCompanyCode, requireContactCode } from './numbering';

export { CreateInvoiceInput, InvoiceLineInput, UpdateInvoiceInput };

export interface InvoiceListRow {
	id: string;
	invoiceNo: string;
	issueDate: string;
	total: string;
	contactId: string;
	contactName: string;
}

export interface InvoiceLineRow {
	id: string;
	lineNo: number;
	description: string;
	quantity: string;
	unitPrice: string;
	amount: string;
}

export interface InvoiceDetail {
	id: string;
	companyId: string;
	contactId: string;
	invoiceNo: string;
	subject: string | null;
	issueDate: string;
	dueDate: string | null;
	subtotal: string;
	discount: string;
	taxRate: string | null;
	taxAmount: string;
	total: string;
	notes: string | null;
	createdBy: string | null;
	createdAt: Date;
	lines: InvoiceLineRow[];
}

/** Jumlah per baris, subtotal, PPN, dan total dihitung di server; klien hanya menampilkan pratinjau. */
function computeTotals(input: CreateInvoiceInput) {
	const lines = input.lines.map((l) => ({ ...l, amount: toMoney(D(l.quantity).times(l.unitPrice)) }));
	const subtotal = sumMoney(lines.map((l) => l.amount));
	const discount = toMoney(input.discount || '0');
	if (D(discount).gt(subtotal)) throw new ApiError(400, 'validation_error', 'Diskon tidak boleh melebihi subtotal', undefined, { field: 'discount' });
	// PPN dihitung dari nilai setelah diskon.
	const taxable = subtotal.minus(discount);
	const taxAmount = input.taxRate ? toMoney(taxable.times(input.taxRate).div(100)) : '0.00';
	const total = toMoney(taxable.plus(taxAmount));
	return { lines, subtotal: toMoney(subtotal), discount, taxAmount, total };
}

async function insertLines(tx: Tx, invoiceId: string, lines: ReturnType<typeof computeTotals>['lines']) {
	await tx.insert(invoiceLines).values(
		lines.map((l, i) => ({
			invoiceId,
			lineNo: i + 1,
			description: l.description,
			quantity: l.quantity,
			unitPrice: l.unitPrice,
			amount: l.amount
		}))
	);
}

/** Buat invoice: nomor `NNN/<PERUSAHAAN>-<KONTAK>/INV/<BULAN>/<TAHUN>` dibuat saat itu juga; tidak ada status dan tidak ada jurnal. */
export async function createInvoice(companyId: string, userId: string, input: CreateInvoiceInput): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const contact = await assertContact(tx, companyId, input.contactId, 'CUSTOMER');
		const totals = computeTotals(input);
		const companyCode = await requireCompanyCode(tx, companyId);
		const contactCode = requireContactCode(contact.code);
		const invoiceNo = await nextDocumentNumber(tx, companyId, { kind: 'INV', issueDate: input.issueDate, companyCode, contactCode });

		const [row] = await tx
			.insert(invoices)
			.values({
				companyId,
				contactId: input.contactId,
				invoiceNo,
				subject: input.subject || null,
				issueDate: input.issueDate,
				dueDate: input.dueDate ?? null,
				subtotal: totals.subtotal,
				discount: totals.discount,
				taxRate: input.taxRate ?? null,
				taxAmount: totals.taxAmount,
				total: totals.total,
				notes: input.notes || null,
				createdBy: userId
			})
			.returning({ id: invoices.id });
		await insertLines(tx, row.id, totals.lines);
		return { id: row.id };
	});
}

/** Ubah menimpa header dan seluruh baris; nomor tetap. Kontak hanya divalidasi ulang bila diganti. */
export async function updateInvoice(companyId: string, invoiceId: string, input: UpdateInvoiceInput): Promise<void> {
	return db.transaction(async (tx) => {
		const current = await tx.query.invoices.findFirst({
			where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId), isNull(invoices.deletedAt))
		});
		if (!current) throw notFound('Invoice');
		if (input.contactId !== current.contactId) await assertContact(tx, companyId, input.contactId, 'CUSTOMER');

		const totals = computeTotals(input);
		await tx
			.update(invoices)
			.set({
				contactId: input.contactId,
				subject: input.subject || null,
				issueDate: input.issueDate,
				dueDate: input.dueDate ?? null,
				subtotal: totals.subtotal,
				discount: totals.discount,
				taxRate: input.taxRate ?? null,
				taxAmount: totals.taxAmount,
				total: totals.total,
				notes: input.notes || null
			})
			.where(eq(invoices.id, invoiceId));
		await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
		await insertLines(tx, invoiceId, totals.lines);
	});
}

/** Soft delete: barisnya tetap ada supaya nomor dokumen tidak pernah dipakai ulang. */
export async function deleteInvoice(companyId: string, invoiceId: string): Promise<void> {
	const deleted = await db
		.update(invoices)
		.set({ deletedAt: new Date() })
		.where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId), isNull(invoices.deletedAt)))
		.returning({ id: invoices.id });
	if (deleted.length === 0) throw notFound('Invoice');
}

export async function listInvoices(companyId: string): Promise<InvoiceListRow[]> {
	return db
		.select({
			id: invoices.id,
			invoiceNo: invoices.invoiceNo,
			issueDate: invoices.issueDate,
			total: invoices.total,
			contactId: invoices.contactId,
			contactName: contacts.name
		})
		.from(invoices)
		.innerJoin(contacts, and(eq(contacts.id, invoices.contactId), eq(contacts.companyId, companyId)))
		.where(and(eq(invoices.companyId, companyId), isNull(invoices.deletedAt)))
		.orderBy(asc(invoices.issueDate), asc(invoices.invoiceNo));
}

export async function getInvoice(companyId: string, invoiceId: string): Promise<InvoiceDetail> {
	const row = await db.query.invoices.findFirst({
		where: and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId), isNull(invoices.deletedAt))
	});
	if (!row) throw notFound('Invoice');
	const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.lineNo));
	return { ...row, lines };
}
