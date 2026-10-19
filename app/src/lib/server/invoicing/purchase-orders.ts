import { asc, eq, sql } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { CreatePurchaseOrderInput, POLineInput } from '../../schemas/purchase-order';
import { assertAccountOfType } from './accounts';
import { assertLeafAccount } from '../accounts/queries';
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

async function computeLines(tx: Tx, companyId: string, lines: POLineInput[]) {
	const computed = [];
	for (const l of lines) {
		await assertAccountOfType(tx, companyId, l.expenseAccountId, 'EXPENSE');
		computed.push({ ...l, amount: toMoney(D(l.quantity).times(l.unitPrice)) });
	}
	return computed;
}

/** Buat PO Draft: akun divalidasi, subtotal/pajak/total dihitung di server, tanpa nomor dan tanpa jurnal. */
export async function createPurchaseOrder(
	companyId: string,
	userId: string,
	input: CreatePurchaseOrderInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		await assertAccountOfType(tx, companyId, input.payableAccountId, 'LIABILITY');
		if (input.taxAccountId) await assertLeafAccount(tx, companyId, input.taxAccountId);

		const computedLines = await computeLines(tx, companyId, input.lines);
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
		.innerJoin(contacts, eq(contacts.id, purchaseOrders.contactId))
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
 * saat Diterima), Diterima membalik jurnal yang sudah diposting. Mengikuti pola `cancelInvoice`
 * (Task 7): status awal dibaca sekali di luar lock untuk menentukan jalur mana yang berlaku --
 * itu dianggap "niat" pemanggil, konsisten dengan role yang sudah diputuskan di route berdasarkan
 * status yang sama. Begitu company di-lock, status dibaca ulang di tiap jalur supaya balapan
 * dengan transisi lain (`receivePurchaseOrder`) tidak diam-diam meloncat ke jalur yang berbeda.
 */
export async function cancelPurchaseOrder(companyId: string, userId: string, poId: string): Promise<void> {
	const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) });
	if (!po || po.companyId !== companyId) throw notFound('PO');
	if (po.status === 'CANCELLED') throw new ApiError(409, 'invalid_status', 'PO sudah dibatalkan');

	if (po.status !== 'RECEIVED') {
		return db.transaction(async (tx) => {
			await tx.execute(sql`select id from companies where id = ${companyId} for update`);

			const current = await tx.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) });
			if (!current || current.companyId !== companyId) throw notFound('PO');
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

		await reverseJournalEntries(tx, { companyId, createdBy: userId, purchaseOrderId: poId, descriptionPrefix: 'Pembalikan' });

		await tx.update(purchaseOrders).set({ status: 'CANCELLED' }).where(eq(purchaseOrders.id, poId));
	});
}
