import { and, asc, desc, eq, inArray, isNull, ne, notExists, sql } from 'drizzle-orm';
import { computeStatus, resolveTermAmounts, sumUnpaid, type ArApStatus } from '../../arap-terms';
import { sumMoney, toMoney } from '../../money';
import { CreateArApInput, UpdateArApInput } from '../../schemas/ar-ap';
import { ApiError, notFound } from '../api';
import { db, type Executor, type Tx } from '../db';
import { isUniqueViolation } from '../db/errors';
import { arApEntries, arApTerms, contacts, invoices, purchaseOrders } from '../db/schema';
import { assertContact } from '../invoicing/contacts';

// Catatan: jangan impor invoices.ts / purchase-orders.ts dari sini; keduanya akan mengimpor modul ini.

export { CreateArApInput, UpdateArApInput };

type Kind = 'AR' | 'AP';

export interface ArApTermView {
	id: string;
	termNo: number;
	name: string | null;
	percent: string;
	amount: string;
	paid: boolean;
	/** `null` bila tidak terhubung atau dokumennya sudah dihapus (soft delete). */
	document: { id: string; no: string; currency: string; total: string } | null;
	currencyMismatch: boolean;
}

export interface ArApListRow {
	id: string;
	kind: Kind;
	title: string;
	contactId: string;
	contactName: string;
	total: string;
	currency: string;
	hasTerms: boolean;
	status: ArApStatus;
	paidAmount: string;
	remainingAmount: string;
	documentCount: number;
	termCount: number;
	/** Nomor dokumen untuk entri tanpa termin; `null` untuk entri bertermin. */
	singleDocumentNo: string | null;
	currencyMismatch: boolean;
}

export interface ArApDetail extends Omit<ArApListRow, 'documentCount' | 'singleDocumentNo'> {
	terms: ArApTermView[];
}

const LINK_INDEXES = ['ar_ap_terms_invoice_uq', 'ar_ap_terms_po_uq'];
const documentAlreadyLinked = () =>
	new ApiError(409, 'document_already_linked', 'Dokumen ini sudah terhubung ke AR/AP lain', undefined, { field: 'documentId' });
const isLinkViolation = (e: unknown) => LINK_INDEXES.some((name) => isUniqueViolation(e, name));

/**
 * Jalankan transaksi dan petakan unique violation tautan dokumen ke 409. Di Postgres pelanggaran
 * membatalkan transaksi, jadi ditangkap di luar `db.transaction`.
 */
async function withLinkGuard<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
	try {
		return await db.transaction(fn);
	} catch (e) {
		if (isLinkViolation(e)) throw documentAlreadyLinked();
		throw e;
	}
}

const contactKind = (kind: Kind) => (kind === 'AR' ? 'CUSTOMER' : 'VENDOR');
const documentLabel = (kind: Kind) => (kind === 'AR' ? 'Invoice' : 'Purchase order');

/** Dokumen aktif (belum dihapus) milik perusahaan ini dengan jenis yang sesuai `kind`; `undefined` bila tidak ada. */
async function findActiveDocument(ex: Executor, companyId: string, kind: Kind, documentId: string) {
	if (kind === 'AR') {
		const [row] = await ex
			.select({ id: invoices.id })
			.from(invoices)
			.where(and(eq(invoices.id, documentId), eq(invoices.companyId, companyId), isNull(invoices.deletedAt)))
			.limit(1);
		return row;
	}
	const [row] = await ex
		.select({ id: purchaseOrders.id })
		.from(purchaseOrders)
		.where(and(eq(purchaseOrders.id, documentId), eq(purchaseOrders.companyId, companyId), isNull(purchaseOrders.deletedAt)))
		.limit(1);
	return row;
}

/** Baris termin yang akan disimpan. Entri tanpa termin tetap punya satu termin implisit (100%). */
function buildTermRows(input: CreateArApInput) {
	if (input.terms.length === 0) {
		return [{ name: null, percent: '100.00', amount: toMoney(input.total), paid: input.paid, documentId: input.documentId ?? null }];
	}
	let amounts: { amount: string; percent: string }[];
	try {
		amounts = resolveTermAmounts(input.total, input.terms);
	} catch (e) {
		throw new ApiError(400, 'validation_error', (e as Error).message, undefined, { field: 'terms' });
	}
	return input.terms.map((t, i) => ({ name: t.name, ...amounts[i], paid: t.paid, documentId: t.documentId ?? null }));
}

async function insertTerms(tx: Tx, companyId: string, entryId: string, kind: Kind, input: CreateArApInput) {
	const rows = buildTermRows(input);
	for (const r of rows) {
		if (r.documentId && !(await findActiveDocument(tx, companyId, kind, r.documentId))) {
			const label = kind === 'AR' ? 'invoice' : 'purchase order';
			throw new ApiError(400, 'invalid_document', `Dokumen tidak ditemukan atau bukan ${label}`, undefined, {
				field: input.terms.length === 0 ? 'documentId' : 'terms'
			});
		}
	}
	await tx.insert(arApTerms).values(
		rows.map((r, i) => ({
			entryId,
			termNo: i + 1,
			name: r.name,
			percent: r.percent,
			amount: r.amount,
			paid: r.paid,
			invoiceId: kind === 'AR' ? r.documentId : null,
			purchaseOrderId: kind === 'AP' ? r.documentId : null
		}))
	);
}

export async function createArAp(companyId: string, userId: string, input: CreateArApInput): Promise<{ id: string }> {
	return withLinkGuard(async (tx) => {
		await assertContact(tx, companyId, input.contactId, contactKind(input.kind));
		const [row] = await tx
			.insert(arApEntries)
			.values({
				companyId,
				kind: input.kind,
				contactId: input.contactId,
				title: input.title,
				total: input.total,
				currency: input.currency,
				hasTerms: input.terms.length > 0,
				createdBy: userId
			})
			.returning({ id: arApEntries.id });
		await insertTerms(tx, companyId, row.id, input.kind, input);
		return { id: row.id };
	});
}

/** Ubah menimpa header dan seluruh termin (hapus lalu masukkan ulang); `kind` tidak boleh berubah. */
export async function updateArAp(companyId: string, id: string, input: UpdateArApInput): Promise<void> {
	return withLinkGuard(async (tx) => {
		const [current] = await tx
			.select({ id: arApEntries.id, kind: arApEntries.kind, contactId: arApEntries.contactId, hasTerms: arApEntries.hasTerms })
			.from(arApEntries)
			.where(and(eq(arApEntries.id, id), eq(arApEntries.companyId, companyId), isNull(arApEntries.deletedAt)))
			.limit(1)
			.for('update');
		if (!current) throw notFound('AR/AP');
		if (input.kind !== current.kind) {
			throw new ApiError(400, 'validation_error', 'Jenis AR/AP tidak bisa diubah', undefined, { field: 'kind' });
		}
		// Kontak lama tetap boleh dipakai walau sudah dinonaktifkan/dihapus; kontak baru harus valid.
		if (input.contactId !== current.contactId) await assertContact(tx, companyId, input.contactId, contactKind(current.kind));

		// Bertermin -> tanpa termin: status lunas ditentukan server (lunas hanya bila semua termin lama lunas),
		// `input.paid` dari klien diabaikan pada transisi ini saja.
		let effective = input;
		if (current.hasTerms && input.terms.length === 0) {
			const old = await tx.select({ paid: arApTerms.paid }).from(arApTerms).where(eq(arApTerms.entryId, id));
			effective = { ...input, paid: old.length > 0 && old.every((t) => t.paid) };
		}

		await tx
			.update(arApEntries)
			.set({ contactId: input.contactId, title: input.title, total: input.total, currency: input.currency, hasTerms: input.terms.length > 0 })
			.where(eq(arApEntries.id, id));
		await tx.delete(arApTerms).where(eq(arApTerms.entryId, id));
		await insertTerms(tx, companyId, id, current.kind, effective);
	});
}

/** Soft delete; semua tautan termin dikosongkan supaya dokumennya bisa dipakai entri lain. */
export async function deleteArAp(companyId: string, id: string): Promise<void> {
	return db.transaction(async (tx) => {
		const deleted = await tx
			.update(arApEntries)
			.set({ deletedAt: new Date() })
			.where(and(eq(arApEntries.id, id), eq(arApEntries.companyId, companyId), isNull(arApEntries.deletedAt)))
			.returning({ id: arApEntries.id });
		if (deleted.length === 0) throw notFound('AR/AP');
		await tx.update(arApTerms).set({ invoiceId: null, purchaseOrderId: null }).where(eq(arApTerms.entryId, id));
	});
}

/** Termin beserta dokumen aktifnya (dokumen yang sudah dihapus dibaca sebagai `null`). */
async function loadTerms(entryIds: string[]) {
	if (entryIds.length === 0) return [];
	return db
		.select({
			entryId: arApTerms.entryId,
			id: arApTerms.id,
			termNo: arApTerms.termNo,
			name: arApTerms.name,
			percent: arApTerms.percent,
			amount: arApTerms.amount,
			paid: arApTerms.paid,
			invId: invoices.id,
			invNo: invoices.invoiceNo,
			invCurrency: invoices.currency,
			invTotal: invoices.total,
			poId: purchaseOrders.id,
			poNo: purchaseOrders.poNo,
			poCurrency: purchaseOrders.currency,
			poTotal: purchaseOrders.total
		})
		.from(arApTerms)
		.leftJoin(invoices, and(eq(invoices.id, arApTerms.invoiceId), isNull(invoices.deletedAt)))
		.leftJoin(purchaseOrders, and(eq(purchaseOrders.id, arApTerms.purchaseOrderId), isNull(purchaseOrders.deletedAt)))
		.where(inArray(arApTerms.entryId, entryIds))
		.orderBy(asc(arApTerms.termNo));
}

function toTermView(r: Awaited<ReturnType<typeof loadTerms>>[number], entryCurrency: string): ArApTermView {
	const document = r.invId
		? { id: r.invId, no: r.invNo!, currency: r.invCurrency!, total: r.invTotal! }
		: r.poId
			? { id: r.poId, no: r.poNo!, currency: r.poCurrency!, total: r.poTotal! }
			: null;
	return {
		id: r.id,
		termNo: r.termNo,
		name: r.name,
		percent: r.percent,
		amount: r.amount,
		paid: r.paid,
		document,
		currencyMismatch: document !== null && document.currency !== entryCurrency
	};
}

function summarize(terms: ArApTermView[]) {
	return {
		status: computeStatus(terms),
		paidAmount: toMoney(sumMoney(terms.filter((t) => t.paid).map((t) => t.amount))),
		remainingAmount: sumUnpaid(terms),
		termCount: terms.length,
		currencyMismatch: terms.some((t) => t.currencyMismatch)
	};
}

const entryColumns = {
	id: arApEntries.id,
	kind: arApEntries.kind,
	title: arApEntries.title,
	contactId: arApEntries.contactId,
	contactName: contacts.name,
	total: arApEntries.total,
	currency: arApEntries.currency,
	hasTerms: arApEntries.hasTerms
};

export async function getArAp(companyId: string, id: string): Promise<ArApDetail> {
	const [entry] = await db
		.select(entryColumns)
		.from(arApEntries)
		.innerJoin(contacts, eq(contacts.id, arApEntries.contactId))
		.where(and(eq(arApEntries.id, id), eq(arApEntries.companyId, companyId), isNull(arApEntries.deletedAt)))
		.limit(1);
	if (!entry) throw notFound('AR/AP');
	const terms = (await loadTerms([id])).map((r) => toTermView(r, entry.currency));
	return { ...entry, ...summarize(terms), terms };
}

export async function listArAp(companyId: string, kind: Kind): Promise<ArApListRow[]> {
	const entries = await db
		.select(entryColumns)
		.from(arApEntries)
		.innerJoin(contacts, eq(contacts.id, arApEntries.contactId))
		.where(and(eq(arApEntries.companyId, companyId), eq(arApEntries.kind, kind), isNull(arApEntries.deletedAt)))
		.orderBy(desc(arApEntries.createdAt));
	const byEntry = new Map<string, Awaited<ReturnType<typeof loadTerms>>>();
	for (const r of await loadTerms(entries.map((e) => e.id))) {
		const list = byEntry.get(r.entryId) ?? [];
		list.push(r);
		byEntry.set(r.entryId, list);
	}
	return entries.map((e) => {
		const terms = (byEntry.get(e.id) ?? []).map((r) => toTermView(r, e.currency));
		const docs = terms.filter((t) => t.document !== null);
		return {
			...e,
			...summarize(terms),
			documentCount: docs.length,
			singleDocumentNo: e.hasTerms ? null : (terms[0]?.document?.no ?? null)
		};
	});
}

export async function setTermPaid(companyId: string, entryId: string, termId: string, paid: boolean): Promise<void> {
	const updated = await db
		.update(arApTerms)
		.set({ paid })
		.where(
			and(
				eq(arApTerms.id, termId),
				eq(arApTerms.entryId, entryId),
				sql`exists (select 1 from ${arApEntries} where ${arApEntries.id} = ${arApTerms.entryId} and ${arApEntries.companyId} = ${companyId} and ${arApEntries.deletedAt} is null)`
			)
		)
		.returning({ id: arApTerms.id });
	if (updated.length === 0) throw notFound('Termin');
}

/**
 * Dokumen yang bisa dipilih: belum dihapus dan belum terhubung ke termin mana pun, kecuali termin
 * `includeTermId` (supaya dokumen termin yang sedang diedit tetap muncul).
 */
export async function listLinkableDocuments(
	companyId: string,
	kind: Kind,
	opts: { includeTermId?: string } = {}
): Promise<{ id: string; no: string; contactName: string; currency: string; total: string }[]> {
	const otherTerm = (col: typeof arApTerms.invoiceId | typeof arApTerms.purchaseOrderId, docId: typeof invoices.id | typeof purchaseOrders.id) =>
		notExists(
			db
				.select({ one: sql`1` })
				.from(arApTerms)
				.where(and(eq(col, docId), opts.includeTermId ? ne(arApTerms.id, opts.includeTermId) : undefined))
		);
	if (kind === 'AR') {
		return db
			.select({ id: invoices.id, no: invoices.invoiceNo, contactName: contacts.name, currency: invoices.currency, total: invoices.total })
			.from(invoices)
			.innerJoin(contacts, eq(contacts.id, invoices.contactId))
			.where(and(eq(invoices.companyId, companyId), isNull(invoices.deletedAt), otherTerm(arApTerms.invoiceId, invoices.id)))
			.orderBy(asc(invoices.issueDate), asc(invoices.invoiceNo));
	}
	return db
		.select({ id: purchaseOrders.id, no: purchaseOrders.poNo, contactName: contacts.name, currency: purchaseOrders.currency, total: purchaseOrders.total })
		.from(purchaseOrders)
		.innerJoin(contacts, eq(contacts.id, purchaseOrders.contactId))
		.where(and(eq(purchaseOrders.companyId, companyId), isNull(purchaseOrders.deletedAt), otherTerm(arApTerms.purchaseOrderId, purchaseOrders.id)))
		.orderBy(asc(purchaseOrders.issueDate), asc(purchaseOrders.poNo));
}

/**
 * Hubungkan dokumen ke termin di dalam transaksi pemanggil (dipakai saat membuat invoice/PO dari termin).
 * Jenis dokumen mengikuti entri induk. 404 bila termin/dokumen bukan milik perusahaan ini; 409
 * `term_already_linked` bila termin sudah punya dokumen aktif lain (tautan ke dokumen terhapus boleh ditimpa).
 *
 * Unique violation dipetakan ke 409 `document_already_linked` lalu dilempar ulang: transaksi pemanggil sudah
 * batal di Postgres, jadi pemanggil tidak boleh menelan error ini dan melanjutkan transaksi.
 */
export async function linkDocumentToTerm(tx: Tx, companyId: string, termId: string, documentId: string): Promise<void> {
	const [term] = await tx
		.select({ kind: arApEntries.kind, invoiceId: arApTerms.invoiceId, purchaseOrderId: arApTerms.purchaseOrderId })
		.from(arApTerms)
		.innerJoin(arApEntries, eq(arApEntries.id, arApTerms.entryId))
		.where(and(eq(arApTerms.id, termId), eq(arApEntries.companyId, companyId), isNull(arApEntries.deletedAt)))
		.limit(1)
		.for('update');
	if (!term) throw notFound('Termin');
	const kind = term.kind;
	const currentId = kind === 'AR' ? term.invoiceId : term.purchaseOrderId;
	if (currentId && currentId !== documentId && (await findActiveDocument(tx, companyId, kind, currentId))) {
		throw new ApiError(409, 'term_already_linked', 'Termin ini sudah terhubung ke dokumen lain');
	}
	if (!(await findActiveDocument(tx, companyId, kind, documentId))) throw notFound(documentLabel(kind));
	try {
		await tx
			.update(arApTerms)
			.set(kind === 'AR' ? { invoiceId: documentId } : { purchaseOrderId: documentId })
			.where(eq(arApTerms.id, termId));
	} catch (e) {
		if (isLinkViolation(e)) throw documentAlreadyLinked();
		throw e;
	}
}
