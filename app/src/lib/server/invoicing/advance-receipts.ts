import { asc, eq, sql } from 'drizzle-orm';
import { CreateAdvanceReceiptInput } from '../../schemas/advance-receipt';
import { assertAccountOfType } from './accounts';
import { ApiError, notFound } from '../api';
import { assertPeriodOpen } from '../closing/lock';
import { db } from '../db';
import { advanceReceipts, companies, contacts } from '../db/schema';
import { nextDocumentNumber } from './numbering';
import { postJournal, reverseJournalEntries } from './posting';

export { CreateAdvanceReceiptInput };

export interface AdvanceReceiptListRow {
	id: string;
	receiptNo: string;
	receiptDate: string;
	status: 'ACTIVE' | 'APPLIED' | 'REFUNDED';
	amount: string;
	contactId: string;
	contactName: string;
}

export interface AdvanceReceiptDetail {
	id: string;
	companyId: string;
	contactId: string;
	receiptNo: string;
	receiptDate: string;
	amount: string;
	status: 'ACTIVE' | 'APPLIED' | 'REFUNDED';
	deferredRevenueAccountId: string;
	appliedToInvoiceId: string | null;
	createdBy: string | null;
	createdAt: Date;
}

/** Catat uang muka: diposting langsung tanpa tahap Draft (Dr bank / Cr pendapatan diterima dimuka). */
export async function createAdvanceReceipt(
	companyId: string,
	userId: string,
	input: CreateAdvanceReceiptInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);

		const company = await tx.query.companies.findFirst({ where: eq(companies.id, companyId) });
		if (!company?.bankAccountId) throw new ApiError(409, 'bank_account_not_set', 'Akun bank perusahaan belum diatur di Pengaturan → Perusahaan');

		await assertAccountOfType(tx, companyId, input.deferredRevenueAccountId, 'LIABILITY');
		await assertPeriodOpen(tx, companyId, [input.receiptDate]);

		const receiptNo = await nextDocumentNumber(tx, companyId, 'UM', input.receiptDate.slice(0, 4));

		const [row] = await tx
			.insert(advanceReceipts)
			.values({
				companyId,
				contactId: input.contactId,
				receiptNo,
				receiptDate: input.receiptDate,
				amount: input.amount,
				status: 'ACTIVE',
				deferredRevenueAccountId: input.deferredRevenueAccountId,
				createdBy: userId
			})
			.returning({ id: advanceReceipts.id });

		await postJournal(tx, {
			companyId,
			entryDate: input.receiptDate,
			refNo: receiptNo,
			description: `Uang muka ${receiptNo}`,
			createdBy: userId,
			lines: [
				{ accountId: company.bankAccountId, debit: input.amount, credit: '0.00' },
				{ accountId: input.deferredRevenueAccountId, debit: '0.00', credit: input.amount }
			],
			advanceReceiptId: row.id
		});

		return { id: row.id };
	});
}

export async function listAdvanceReceipts(companyId: string): Promise<AdvanceReceiptListRow[]> {
	return db
		.select({
			id: advanceReceipts.id,
			receiptNo: advanceReceipts.receiptNo,
			receiptDate: advanceReceipts.receiptDate,
			status: advanceReceipts.status,
			amount: advanceReceipts.amount,
			contactId: advanceReceipts.contactId,
			contactName: contacts.name
		})
		.from(advanceReceipts)
		.innerJoin(contacts, eq(contacts.id, advanceReceipts.contactId))
		.where(eq(advanceReceipts.companyId, companyId))
		.orderBy(asc(advanceReceipts.receiptDate));
}

export async function getAdvanceReceipt(companyId: string, id: string): Promise<AdvanceReceiptDetail> {
	const row = await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, id) });
	if (!row || row.companyId !== companyId) throw notFound('Uang muka');
	return row;
}

/**
 * Batalkan uang muka ACTIVE: jurnalnya dibalik dan statusnya jadi REFUNDED. Yang sudah APPLIED ke
 * invoice tidak bisa langsung dibatalkan di sini -- invoice-nya harus dibatalkan dulu (Task 9
 * mengembalikan status ke ACTIVE saat itu terjadi). Status dibaca sekali di luar lock untuk
 * menolak cepat kalau jelas-jelas sudah tidak ACTIVE, lalu dibaca ulang di dalam lock sebelum
 * membalik jurnal -- mengikuti disiplin yang sama dengan cancelInvoice (Task 7) supaya tidak ada
 * race antara baca awal dan company di-lock.
 */
export async function cancelAdvanceReceipt(companyId: string, userId: string, id: string): Promise<void> {
	const receipt = await db.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, id) });
	if (!receipt || receipt.companyId !== companyId) throw notFound('Uang muka');
	if (receipt.status !== 'ACTIVE') {
		throw new ApiError(409, 'invalid_status', 'Uang muka harus berstatus Aktif untuk dibatalkan');
	}

	return db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);

		const current = await tx.query.advanceReceipts.findFirst({ where: eq(advanceReceipts.id, id) });
		if (!current || current.companyId !== companyId) throw notFound('Uang muka');
		if (current.status !== 'ACTIVE') {
			throw new ApiError(409, 'invalid_status', 'Uang muka harus berstatus Aktif untuk dibatalkan');
		}

		// onlyUnlinked: true -- a receipt's id also sits on any invoice-payment entry that applied it
		// (Task 9) and that entry's own reversal, both of which carry invoiceId too. Without this,
		// refunding the receipt would also re-reverse those invoice-linked entries every time.
		await reverseJournalEntries(tx, { companyId, createdBy: userId, advanceReceiptId: id, descriptionPrefix: 'Pembalikan', onlyUnlinked: true });

		await tx.update(advanceReceipts).set({ status: 'REFUNDED' }).where(eq(advanceReceipts.id, id));
	});
}
