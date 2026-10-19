import { and, asc, eq, sql } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { CreatePurchaseOrderInput, POLineInput } from '../../schemas/purchase-order';
import { assertAccountOfType } from './accounts';
import { assertContact } from './contacts';
import { ApiError, notFound } from '../api';
import { assertPeriodOpen } from '../closing/lock';
import { db, type Tx } from '../db';
import { contacts, purchaseOrderLines, purchaseOrders } from '../db/schema';
import { nextDocumentNumber } from './numbering';
import { postJournal, reverseJournalEntries } from './posting';
import type { JournalLineInput } from '../journal/lines';

export { CreatePurchaseOrderInput, POLineInput };

export interface POListRow {
	id: string;
	poNo: string | null;
	issueDate: string;
	status: 'DRAFT' | 'ISSUED' | 'RECEIVED' | 'CANCELLED';
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
	expenseAccountId: string;
}

export interface PODetail {
	id: string;
	companyId: string;
	contactId: string;
	poNo: string | null;
	issueDate: string;
	expectedDate: string | null;
	payableAccountId: string;
	status: 'DRAFT' | 'ISSUED' | 'RECEIVED' | 'CANCELLED';
	subtotal: string;
	taxRate: string | null;
	taxAccountId: string | null;
	taxAmount: string;
	total: string;
	notes: string | null;
	createdBy: string | null;
	createdAt: Date;
	lines: POLineRow[];
}

/** Akun PPN boleh ASSET atau LIABILITY (tergantung template bagan akun), tapi tidak pernah pendapatan/biaya/ekuitas. */
const TAX_ACCOUNT_TYPES: Array<'ASSET' | 'LIABILITY'> = ['ASSET', 'LIABILITY'];

/**
 * Validasi semua akun yang dirujuk PO. Dipanggil saat Draft dibuat DAN lagi saat diposting
 * (Terima), karena akun bisa dinonaktifkan/diberi anak/diubah tipenya di antara keduanya.
 */
async function assertPOAccounts(
	tx: Tx,
	companyId: string,
	accts: { payableAccountId: string; taxAccountId: string | null | undefined; expenseAccountIds: string[] }
) {
	await assertAccountOfType(tx, companyId, accts.payableAccountId, 'LIABILITY');
	if (accts.taxAccountId) await assertAccountOfType(tx, companyId, accts.taxAccountId, TAX_ACCOUNT_TYPES);
	for (const id of accts.expenseAccountIds) await assertAccountOfType(tx, companyId, id, 'EXPENSE');
}

function computeLines(lines: POLineInput[]) {
	return lines.map((l) => ({ ...l, amount: toMoney(D(l.quantity).times(l.unitPrice)) }));
}

/** Buat PO Draft: akun divalidasi, subtotal/pajak/total dihitung di server, tanpa nomor dan tanpa jurnal. */
export async function createPurchaseOrder(
	companyId: string,
	userId: string,
	input: CreatePurchaseOrderInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		await assertContact(tx, companyId, input.contactId, 'VENDOR');
		await assertPOAccounts(tx, companyId, {
			payableAccountId: input.payableAccountId,
			taxAccountId: input.taxAccountId,
			expenseAccountIds: input.lines.map((l) => l.expenseAccountId)
		});

		const computedLines = computeLines(input.lines);
		const subtotal = sumMoney(computedLines.map((l) => l.amount));
		const taxAmount = input.taxRate ? toMoney(subtotal.times(input.taxRate).div(100)) : '0.00';
		const total = toMoney(subtotal.plus(taxAmount));

		const [row] = await tx
			.insert(purchaseOrders)
			.values({
				companyId,
				contactId: input.contactId,
				poNo: null,
				issueDate: input.issueDate,
				expectedDate: input.expectedDate ?? null,
				payableAccountId: input.payableAccountId,
				status: 'DRAFT',
				subtotal: toMoney(subtotal),
				taxRate: input.taxRate ?? null,
				taxAccountId: input.taxAccountId ?? null,
				taxAmount,
				total,
				notes: input.notes || null,
				createdBy: userId
			})
			.returning({ id: purchaseOrders.id });

		await tx.insert(purchaseOrderLines).values(
			computedLines.map((l, i) => ({
				poId: row.id,
				lineNo: i + 1,
				description: l.description,
				quantity: l.quantity,
				unitPrice: l.unitPrice,
				amount: l.amount,
				expenseAccountId: l.expenseAccountId
			}))
		);

		return { id: row.id };
	});
}

export async function listPurchaseOrders(companyId: string): Promise<POListRow[]> {
	return db
		.select({
			id: purchaseOrders.id,
			poNo: purchaseOrders.poNo,
			issueDate: purchaseOrders.issueDate,
			status: purchaseOrders.status,
			total: purchaseOrders.total,
			contactId: purchaseOrders.contactId,
			contactName: contacts.name
		})
		.from(purchaseOrders)
		.innerJoin(contacts, and(eq(contacts.id, purchaseOrders.contactId), eq(contacts.companyId, companyId)))
		.where(eq(purchaseOrders.companyId, companyId))
		.orderBy(asc(purchaseOrders.issueDate));
}

export async function getPurchaseOrder(companyId: string, poId: string): Promise<PODetail> {
	const row = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) });
	if (!row || row.companyId !== companyId) throw notFound('PO');
	const lines = await db
		.select()
		.from(purchaseOrderLines)
		.where(eq(purchaseOrderLines.poId, poId))
		.orderBy(asc(purchaseOrderLines.lineNo));
	return { ...row, lines };
}

/** Terbitkan PO Draft: hanya beri nomor urut dan ubah status, TANPA posting jurnal (beda dengan Kirim invoice). */
export async function issuePurchaseOrder(companyId: string, userId: string, poId: string): Promise<void> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);

		const po = await tx.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) });
		if (!po || po.companyId !== companyId) throw notFound('PO');
		if (po.status !== 'DRAFT') throw new ApiError(409, 'invalid_status', 'PO sudah bukan Draft');

		const poNo = await nextDocumentNumber(tx, companyId, 'PO', po.issueDate.slice(0, 4));

		await tx.update(purchaseOrders).set({ poNo, status: 'ISSUED' }).where(eq(purchaseOrders.id, poId));
	});
}

/** Terima PO Diterbitkan: posting jurnal penerimaan (Dr biaya / Cr utang usaha + PPN), tandai Diterima. */
export async function receivePurchaseOrder(companyId: string, userId: string, poId: string, date: string): Promise<void> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);

		const po = await tx.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) });
		if (!po || po.companyId !== companyId) throw notFound('PO');
		if (po.status !== 'ISSUED') throw new ApiError(409, 'invalid_status', 'PO harus berstatus Diterbitkan untuk diterima');

		await assertPeriodOpen(tx, companyId, [date]);

		const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, poId)).orderBy(asc(purchaseOrderLines.lineNo));

		await assertPOAccounts(tx, companyId, {
			payableAccountId: po.payableAccountId,
			taxAccountId: D(po.taxAmount).gt(0) ? po.taxAccountId : null,
			expenseAccountIds: lines.map((l) => l.expenseAccountId)
		});

		const journalLineInputs: JournalLineInput[] = [
			...lines.map((l) => ({ accountId: l.expenseAccountId, debit: l.amount, credit: '0.00' }))
		];
		if (D(po.taxAmount).gt(0)) {
			journalLineInputs.push({ accountId: po.taxAccountId!, debit: po.taxAmount, credit: '0.00' });
		}
		journalLineInputs.push({ accountId: po.payableAccountId, debit: '0.00', credit: po.total });

		await postJournal(tx, {
			companyId,
			entryDate: date,
			description: `Penerimaan ${po.poNo}`,
			refNo: po.poNo!,
			createdBy: userId,
			lines: journalLineInputs,
			purchaseOrderId: poId
		});

		await tx.update(purchaseOrders).set({ status: 'RECEIVED' }).where(eq(purchaseOrders.id, poId));
	});
}

/**
 * Batalkan PO: Draft/Diterbitkan cukup ubah status (tanpa jurnal, karena jurnal hanya diposting
 * saat Diterima), Diterima membalik jurnal yang sudah diposting. Mengikuti pola `cancelInvoice`:
 * status awal dibaca sekali di luar lock untuk menentukan jalur, lalu dibaca ulang di bawah lock
 * company di tiap jalur supaya balapan dengan `receivePurchaseOrder` tidak diam-diam meloncat ke
 * jalur lain. Otorisasi akhir juga diputuskan di bawah lock itu: route meneruskan `callerIsAdmin`,
 * dan membatalkan PO yang sudah Diterima (diposting) wajib admin -- pemanggil non-admin ditolak
 * 403 `forbidden` meski cek role di route (yang melihat status belum Diterima) sudah lolos.
 */
export async function cancelPurchaseOrder(
	companyId: string,
	userId: string,
	poId: string,
	opts: { callerIsAdmin: boolean }
): Promise<void> {
	const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) });
	if (!po || po.companyId !== companyId) throw notFound('PO');
	if (po.status === 'CANCELLED') throw new ApiError(409, 'invalid_status', 'PO sudah dibatalkan');

	if (po.status !== 'RECEIVED') {
		return db.transaction(async (tx) => {
			await tx.execute(sql`select id from companies where id = ${companyId} for update`);

			const current = await tx.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) });
			if (!current || current.companyId !== companyId) throw notFound('PO');
			if (current.status === 'RECEIVED' && !opts.callerIsAdmin) throw cancelReceivedForbidden();
			if (current.status === 'RECEIVED' || current.status === 'CANCELLED') {
				throw new ApiError(409, 'invalid_status', 'PO sudah berubah status, muat ulang lalu coba batalkan lagi');
			}

			await tx.update(purchaseOrders).set({ status: 'CANCELLED' }).where(eq(purchaseOrders.id, poId));
		});
	}

	return db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);

		const current = await tx.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) });
		if (!current || current.companyId !== companyId) throw notFound('PO');
		if (current.status === 'CANCELLED') throw new ApiError(409, 'invalid_status', 'PO sudah dibatalkan');
		if (!opts.callerIsAdmin) throw cancelReceivedForbidden();

		await reverseJournalEntries(tx, { companyId, createdBy: userId, purchaseOrderId: poId, descriptionPrefix: 'Pembalikan' });

		await tx.update(purchaseOrders).set({ status: 'CANCELLED' }).where(eq(purchaseOrders.id, poId));
	});
}

function cancelReceivedForbidden(): ApiError {
	return new ApiError(403, 'forbidden', 'Hanya admin yang dapat membatalkan PO yang sudah diterima');
}
