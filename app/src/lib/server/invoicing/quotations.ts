import { and, asc, desc, eq, gt, isNull, max, sql } from 'drizzle-orm';
import { todayIso } from '../../dates';
import { quotationNo, quotationStatus, type QuotationStatus } from '../../quotation-status';
import { CreateQuotationInput, ReviseQuotationInput, UpdateQuotationInput } from '../../schemas/quotation';
import { ApiError, notFound } from '../api';
import { db, type Tx } from '../db';
import { isUniqueViolation } from '../db/errors';
import { contacts, quotationLines, quotations } from '../db/schema';
import { assertContact, contactLocked } from './contacts';
import { computeTotals } from './invoices';
import { nextDocumentNumber, requireCompanyCode, requireContactCode } from './numbering';

export { CreateQuotationInput, ReviseQuotationInput, UpdateQuotationInput };

export interface QuotationListRow {
	id: string;
	quotationNo: string;
	issueDate: string;
	validUntil: string | null;
	total: string;
	currency: string;
	contactId: string;
	contactName: string;
	status: QuotationStatus;
	/** Penandatangan pada unduhan PDF terakhir; pilihan awal unduhan berikutnya. */
	lastSignerId: string | null;
}

export interface QuotationLineRow {
	id: string;
	lineNo: number;
	description: string;
	quantity: string;
	unitPrice: string;
	amount: string;
}

export interface QuotationHistoryRow {
	id: string;
	quotationNo: string;
	issueDate: string;
	total: string;
	status: QuotationStatus;
}

export interface QuotationDetail {
	lastSignerId: string | null;
	id: string;
	companyId: string;
	contactId: string;
	baseNo: string;
	revision: number;
	quotationNo: string;
	subject: string | null;
	currency: string;
	issueDate: string;
	validUntil: string | null;
	subtotal: string;
	discount: string;
	taxRate: string | null;
	taxAmount: string;
	total: string;
	notes: string | null;
	approvedAt: Date | null;
	createdAt: Date;
	isLatest: boolean;
	status: QuotationStatus;
	/** Semua versi nomor yang sama (belum dihapus), revisi terbaru dulu, termasuk versi ini. */
	history: QuotationHistoryRow[];
	lines: QuotationLineRow[];
}

const REV_UQ = 'quotations_company_no_rev_uq';
const locked = () => new ApiError(409, 'quotation_locked', 'Penawaran ini sudah direvisi. Hanya versi terbaru yang bisa diubah');
const approved = () => new ApiError(409, 'quotation_approved', 'Batalkan persetujuan terlebih dahulu');

async function insertLines(tx: Tx, quotationId: string, lines: ReturnType<typeof computeTotals>['lines']) {
	await tx.insert(quotationLines).values(
		lines.map((l, i) => ({
			quotationId,
			lineNo: i + 1,
			description: l.description,
			quantity: l.quantity,
			unitPrice: l.unitPrice,
			amount: l.amount
		}))
	);
}

/** Header yang ditulis dari input (tanpa kontak, nomor, dan persetujuan). */
function headerValues(input: CreateQuotationInput, totals: ReturnType<typeof computeTotals>) {
	return {
		subject: input.subject || null,
		issueDate: input.issueDate,
		validUntil: input.validUntil ?? null,
		subtotal: totals.subtotal,
		discount: totals.discount,
		taxRate: input.taxRate ?? null,
		taxAmount: totals.taxAmount,
		total: totals.total,
		notes: input.notes || null
	};
}

/**
 * Kunci (FOR UPDATE) versi yang dituju dan pastikan ia versi terbaru. Dua penulis pada versi yang sama
 * berurutan di sini: yang kedua melihat revisi yang sudah di-commit penulis pertama dan ditolak.
 */
async function lockLatest(tx: Tx, companyId: string, quotationId: string) {
	const [row] = await tx
		.select()
		.from(quotations)
		.where(and(eq(quotations.id, quotationId), eq(quotations.companyId, companyId), isNull(quotations.deletedAt)))
		.limit(1)
		.for('update');
	if (!row) throw notFound('Penawaran');
	const newer = await tx
		.select({ id: quotations.id })
		.from(quotations)
		.where(and(eq(quotations.companyId, companyId), eq(quotations.baseNo, row.baseNo), gt(quotations.revision, row.revision), isNull(quotations.deletedAt)))
		.limit(1);
	if (newer.length > 0) throw locked();
	return row;
}

/** Buat penawaran: nomor `NNN/<PERUSAHAAN>-<KONTAK>/QUO/<BULAN>/<TAHUN>` dibuat saat itu juga; tidak ada jurnal. */
export async function createQuotation(companyId: string, userId: string, input: CreateQuotationInput): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const contact = await assertContact(tx, companyId, input.contactId, 'CUSTOMER');
		const totals = computeTotals(input);
		const companyCode = await requireCompanyCode(tx, companyId);
		const contactCode = requireContactCode(contact.code);
		const baseNo = await nextDocumentNumber(tx, companyId, { kind: 'QUO', issueDate: input.issueDate, companyCode, contactCode });
		const [row] = await tx
			.insert(quotations)
			.values({ companyId, contactId: input.contactId, baseNo, currency: input.currency ?? 'IDR', ...headerValues(input, totals), createdBy: userId })
			.returning({ id: quotations.id });
		await insertLines(tx, row.id, totals.lines);
		return { id: row.id };
	});
}

/** Ubah (koreksi tanpa revisi) menimpa versi terbaru; nomor dan pelanggan tetap. */
export async function updateQuotation(companyId: string, quotationId: string, input: UpdateQuotationInput): Promise<void> {
	return db.transaction(async (tx) => {
		const current = await lockLatest(tx, companyId, quotationId);
		if (current.approvedAt) throw approved();
		if (input.contactId !== current.contactId) throw contactLocked();
		const totals = computeTotals(input);
		await tx
			.update(quotations)
			.set({ ...headerValues(input, totals), ...(input.currency ? { currency: input.currency } : {}) })
			.where(eq(quotations.id, quotationId));
		await tx.delete(quotationLines).where(eq(quotationLines.quotationId, quotationId));
		await insertLines(tx, quotationId, totals.lines);
	});
}

/**
 * Revisi: versi baru dengan nomor dasar sama dan revisi = tertinggi yang pernah ada (termasuk yang terhapus) + 1,
 * sehingga nomor revisi tidak pernah dipakai ulang. Penandatangan terakhir ikut disalin.
 */
export async function reviseQuotation(companyId: string, userId: string, quotationId: string, input: ReviseQuotationInput): Promise<{ id: string }> {
	try {
		return await db.transaction(async (tx) => {
			const source = await lockLatest(tx, companyId, quotationId);
			if (source.approvedAt) throw approved();
			if (input.contactId !== source.contactId) throw contactLocked();
			const totals = computeTotals(input);
			const [{ top }] = await tx
				.select({ top: max(quotations.revision) })
				.from(quotations)
				.where(and(eq(quotations.companyId, companyId), eq(quotations.baseNo, source.baseNo)));
			const [row] = await tx
				.insert(quotations)
				.values({
					companyId,
					contactId: source.contactId,
					baseNo: source.baseNo,
					revision: (top ?? 0) + 1,
					currency: input.currency ?? source.currency,
					...headerValues(input, totals),
					lastSignerId: source.lastSignerId,
					createdBy: userId
				})
				.returning({ id: quotations.id });
			await insertLines(tx, row.id, totals.lines);
			return { id: row.id };
		});
	} catch (e) {
		if (isUniqueViolation(e, REV_UQ)) throw locked();
		throw e;
	}
}

/** Tandai disetujui; boleh dari Menunggu maupun Kedaluwarsa. Mengulang pada versi yang sudah disetujui tidak mengubah apa pun. */
export async function approveQuotation(companyId: string, userId: string, quotationId: string): Promise<void> {
	await db.transaction(async (tx) => {
		const current = await lockLatest(tx, companyId, quotationId);
		if (current.approvedAt) return;
		await tx.update(quotations).set({ approvedAt: new Date(), approvedBy: userId }).where(eq(quotations.id, quotationId));
	});
}

export async function unapproveQuotation(companyId: string, quotationId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await lockLatest(tx, companyId, quotationId);
		await tx.update(quotations).set({ approvedAt: null, approvedBy: null }).where(eq(quotations.id, quotationId));
	});
}

/** Soft delete versi terbaru; versi sebelumnya (bila ada) otomatis menjadi versi terbaru lagi. */
export async function deleteQuotation(companyId: string, quotationId: string): Promise<void> {
	await db.transaction(async (tx) => {
		const current = await lockLatest(tx, companyId, quotationId);
		if (current.approvedAt) throw approved();
		await tx.update(quotations).set({ deletedAt: new Date() }).where(eq(quotations.id, quotationId));
	});
}

/** Hanya versi terbaru tiap nomor. */
export async function listQuotations(companyId: string): Promise<QuotationListRow[]> {
	const rows = await db
		.select({
			id: quotations.id,
			baseNo: quotations.baseNo,
			revision: quotations.revision,
			issueDate: quotations.issueDate,
			validUntil: quotations.validUntil,
			approvedAt: quotations.approvedAt,
			total: quotations.total,
			currency: quotations.currency,
			contactId: quotations.contactId,
			contactName: contacts.name,
			lastSignerId: quotations.lastSignerId
		})
		.from(quotations)
		.innerJoin(contacts, and(eq(contacts.id, quotations.contactId), eq(contacts.companyId, companyId)))
		.where(
			and(
				eq(quotations.companyId, companyId),
				isNull(quotations.deletedAt),
				sql`not exists (select 1 from quotations newer where newer.company_id = ${quotations.companyId} and newer.base_no = ${quotations.baseNo} and newer.revision > ${quotations.revision} and newer.deleted_at is null)`
			)
		)
		.orderBy(asc(quotations.issueDate), asc(quotations.baseNo));
	const today = todayIso();
	return rows.map(({ baseNo, revision, approvedAt, ...r }) => ({
		...r,
		quotationNo: quotationNo(baseNo, revision),
		status: quotationStatus({ approvedAt, validUntil: r.validUntil, isLatest: true }, today)
	}));
}

export async function getQuotation(companyId: string, quotationId: string): Promise<QuotationDetail> {
	const row = await db.query.quotations.findFirst({
		where: and(eq(quotations.id, quotationId), eq(quotations.companyId, companyId), isNull(quotations.deletedAt))
	});
	if (!row) throw notFound('Penawaran');
	const [lines, versions] = await Promise.all([
		db.select().from(quotationLines).where(eq(quotationLines.quotationId, quotationId)).orderBy(asc(quotationLines.lineNo)),
		db
			.select({ id: quotations.id, revision: quotations.revision, issueDate: quotations.issueDate, total: quotations.total, approvedAt: quotations.approvedAt, validUntil: quotations.validUntil })
			.from(quotations)
			.where(and(eq(quotations.companyId, companyId), eq(quotations.baseNo, row.baseNo), isNull(quotations.deletedAt)))
			.orderBy(desc(quotations.revision))
	]);
	const today = todayIso();
	const latestRevision = versions[0].revision;
	const history = versions.map((v) => ({
		id: v.id,
		quotationNo: quotationNo(row.baseNo, v.revision),
		issueDate: v.issueDate,
		total: v.total,
		status: quotationStatus({ approvedAt: v.approvedAt, validUntil: v.validUntil, isLatest: v.revision === latestRevision }, today)
	}));
	const isLatest = row.revision === latestRevision;
	return {
		lastSignerId: row.lastSignerId,
		id: row.id,
		companyId: row.companyId,
		contactId: row.contactId,
		baseNo: row.baseNo,
		revision: row.revision,
		quotationNo: quotationNo(row.baseNo, row.revision),
		subject: row.subject,
		currency: row.currency,
		issueDate: row.issueDate,
		validUntil: row.validUntil,
		subtotal: row.subtotal,
		discount: row.discount,
		taxRate: row.taxRate,
		taxAmount: row.taxAmount,
		total: row.total,
		notes: row.notes,
		approvedAt: row.approvedAt,
		createdAt: row.createdAt,
		isLatest,
		status: quotationStatus({ approvedAt: row.approvedAt, validUntil: row.validUntil, isLatest }, today),
		history,
		lines
	};
}
