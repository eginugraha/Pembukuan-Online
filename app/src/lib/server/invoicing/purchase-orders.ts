import { and, asc, eq, isNull } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { CreatePurchaseOrderInput, POLineInput, UpdatePurchaseOrderInput } from '../../schemas/purchase-order';
import { linkDocumentToTerm } from '../arap/entries';
import { assertContact, contactLocked } from './contacts';
import { notFound } from '../api';
import { db, type Tx } from '../db';
import { contacts, purchaseOrderLines, purchaseOrders } from '../db/schema';
import { nextDocumentNumber, requireCompanyCode, requireContactCode } from './numbering';

export { CreatePurchaseOrderInput, POLineInput, UpdatePurchaseOrderInput };

export interface POListRow {
	/** Penandatangan pada unduhan PDF terakhir; pilihan awal unduhan berikutnya. */
	lastSignerId: string | null;
	id: string;
	poNo: string;
	issueDate: string;
	currency: string;
	total: string;
	contactId: string;
	contactName: string;
}

export interface POLineRow {
	id: string;
	lineNo: number;
	description: string;
	quantity: string;
	unitPrice: string;
	amount: string;
}

export interface PODetail {
	/** Penandatangan pada unduhan PDF terakhir; pilihan awal unduhan berikutnya. */
	lastSignerId: string | null;
	id: string;
	companyId: string;
	contactId: string;
	poNo: string;
	subject: string | null;
	currency: string;
	issueDate: string;
	expectedDate: string | null;
	subtotal: string;
	taxRate: string | null;
	taxAmount: string;
	total: string;
	notes: string | null;
	createdBy: string | null;
	createdAt: Date;
	lines: POLineRow[];
}

/** Jumlah per baris, subtotal, PPN, dan total dihitung di server; klien hanya menampilkan pratinjau. */
function computeTotals(input: CreatePurchaseOrderInput) {
	const lines = input.lines.map((l) => ({ ...l, amount: toMoney(D(l.quantity).times(l.unitPrice)) }));
	const subtotal = sumMoney(lines.map((l) => l.amount));
	const taxAmount = input.taxRate ? toMoney(subtotal.times(input.taxRate).div(100)) : '0.00';
	const total = toMoney(subtotal.plus(taxAmount));
	return { lines, subtotal: toMoney(subtotal), taxAmount, total };
}

async function insertLines(tx: Tx, poId: string, lines: ReturnType<typeof computeTotals>['lines']) {
	await tx.insert(purchaseOrderLines).values(
		lines.map((l, i) => ({
			poId,
			lineNo: i + 1,
			description: l.description,
			quantity: l.quantity,
			unitPrice: l.unitPrice,
			amount: l.amount
		}))
	);
}

/** Buat PO: nomor `NNN/<PERUSAHAAN>-<KONTAK>/PO/<BULAN>/<TAHUN>` dibuat saat itu juga; tidak ada status dan tidak ada jurnal. */
export async function createPurchaseOrder(companyId: string, userId: string, input: CreatePurchaseOrderInput, opts: { linkTermId?: string } = {}): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const contact = await assertContact(tx, companyId, input.contactId, 'VENDOR');
		const totals = computeTotals(input);
		const companyCode = await requireCompanyCode(tx, companyId);
		const contactCode = requireContactCode(contact.code);
		const poNo = await nextDocumentNumber(tx, companyId, { kind: 'PO', issueDate: input.issueDate, companyCode, contactCode });

		const [row] = await tx
			.insert(purchaseOrders)
			.values({
				companyId,
				contactId: input.contactId,
				poNo,
				subject: input.subject || null,
				currency: input.currency ?? 'IDR',
				issueDate: input.issueDate,
				expectedDate: input.expectedDate ?? null,
				subtotal: totals.subtotal,
				taxRate: input.taxRate ?? null,
				taxAmount: totals.taxAmount,
				total: totals.total,
				notes: input.notes || null,
				createdBy: userId
			})
			.returning({ id: purchaseOrders.id });
		await insertLines(tx, row.id, totals.lines);
		// Satu transaksi dengan dokumen: bila tautan gagal, dokumen dan nomornya ikut batal.
		if (opts.linkTermId) await linkDocumentToTerm(tx, companyId, opts.linkTermId, row.id, 'AP');
		return { id: row.id };
	});
}

/** Ubah menimpa header dan seluruh baris; nomor dan kontak tetap (kontak lain ditolak `contact_locked`). */
export async function updatePurchaseOrder(companyId: string, poId: string, input: UpdatePurchaseOrderInput): Promise<void> {
	return db.transaction(async (tx) => {
		const current = await tx.query.purchaseOrders.findFirst({
			where: and(eq(purchaseOrders.id, poId), eq(purchaseOrders.companyId, companyId), isNull(purchaseOrders.deletedAt))
		});
		if (!current) throw notFound('PO');
		if (input.contactId !== current.contactId) throw contactLocked('Pemasok');

		const totals = computeTotals(input);
		await tx
			.update(purchaseOrders)
			.set({
				subject: input.subject || null,
				...(input.currency ? { currency: input.currency } : {}),
				issueDate: input.issueDate,
				expectedDate: input.expectedDate ?? null,
				subtotal: totals.subtotal,
				taxRate: input.taxRate ?? null,
				taxAmount: totals.taxAmount,
				total: totals.total,
				notes: input.notes || null
			})
			.where(eq(purchaseOrders.id, poId));
		await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.poId, poId));
		await insertLines(tx, poId, totals.lines);
	});
}

/** Soft delete: barisnya tetap ada supaya nomor dokumen tidak pernah dipakai ulang. */
export async function deletePurchaseOrder(companyId: string, poId: string): Promise<void> {
	const deleted = await db
		.update(purchaseOrders)
		.set({ deletedAt: new Date() })
		.where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.companyId, companyId), isNull(purchaseOrders.deletedAt)))
		.returning({ id: purchaseOrders.id });
	if (deleted.length === 0) throw notFound('PO');
}

export async function listPurchaseOrders(companyId: string): Promise<POListRow[]> {
	return db
		.select({
			id: purchaseOrders.id,
			poNo: purchaseOrders.poNo,
			issueDate: purchaseOrders.issueDate,
			currency: purchaseOrders.currency,
			total: purchaseOrders.total,
			contactId: purchaseOrders.contactId,
			contactName: contacts.name,
			lastSignerId: purchaseOrders.lastSignerId
		})
		.from(purchaseOrders)
		.innerJoin(contacts, and(eq(contacts.id, purchaseOrders.contactId), eq(contacts.companyId, companyId)))
		.where(and(eq(purchaseOrders.companyId, companyId), isNull(purchaseOrders.deletedAt)))
		.orderBy(asc(purchaseOrders.issueDate), asc(purchaseOrders.poNo));
}

export async function getPurchaseOrder(companyId: string, poId: string): Promise<PODetail> {
	const row = await db.query.purchaseOrders.findFirst({
		where: and(eq(purchaseOrders.id, poId), eq(purchaseOrders.companyId, companyId), isNull(purchaseOrders.deletedAt))
	});
	if (!row) throw notFound('PO');
	const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, poId)).orderBy(asc(purchaseOrderLines.lineNo));
	return { ...row, lines };
}
