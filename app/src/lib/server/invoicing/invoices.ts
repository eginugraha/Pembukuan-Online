import { and, asc, eq, sql } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { CreateInvoiceInput, InvoiceLineInput } from '../../schemas/invoice';
import { assertAccountOfType } from './accounts';
import { assertContact } from './contacts';
import { ApiError, notFound } from '../api';
import { assertPeriodOpen } from '../closing/lock';
import { db, type Tx } from '../db';
import { companies, contacts, invoiceLines, invoices } from '../db/schema';
import { nextDocumentNumber } from './numbering';
import { postJournal, reverseJournalEntries } from './posting';
import type { JournalLineInput } from '../journal/lines';

export { CreateInvoiceInput, InvoiceLineInput };

export interface InvoiceListRow {
	id: string;
	invoiceNo: string | null;
	issueDate: string;
	status: 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED';
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
	revenueAccountId: string;
}

export interface InvoiceDetail {
	id: string;
	companyId: string;
	contactId: string;
	invoiceNo: string | null;
	issueDate: string;
	receivableAccountId: string;
	status: 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED';
	subtotal: string;
	taxRate: string | null;
	taxAccountId: string | null;
	taxAmount: string;
	total: string;
	notes: string | null;
	createdBy: string | null;
	createdAt: Date;
	lines: InvoiceLineRow[];
}

/** Akun PPN boleh ASSET atau LIABILITY (tergantung template bagan akun), tapi tidak pernah pendapatan/biaya/ekuitas. */
const TAX_ACCOUNT_TYPES: Array<'ASSET' | 'LIABILITY'> = ['ASSET', 'LIABILITY'];

/**
 * Validasi semua akun yang dirujuk invoice. Dipanggil saat Draft dibuat DAN lagi saat diposting
 * (Kirim), karena akun bisa dinonaktifkan/diberi anak/diubah tipenya di antara keduanya.
 */
async function assertInvoiceAccounts(
	tx: Tx,
	companyId: string,
	accts: { receivableAccountId: string; taxAccountId: string | null | undefined; revenueAccountIds: string[] }
) {
	await assertAccountOfType(tx, companyId, accts.receivableAccountId, 'ASSET');
	if (accts.taxAccountId) await assertAccountOfType(tx, companyId, accts.taxAccountId, TAX_ACCOUNT_TYPES);
	for (const id of accts.revenueAccountIds) await assertAccountOfType(tx, companyId, id, 'REVENUE');
}

function computeLines(lines: InvoiceLineInput[]) {
	return lines.map((l) => ({ ...l, amount: toMoney(D(l.quantity).times(l.unitPrice)) }));
}

/** Buat invoice Draft: akun divalidasi, subtotal/pajak/total dihitung di server, tanpa nomor dan tanpa jurnal. */
export async function createInvoice(
	companyId: string,
	userId: string,
	input: CreateInvoiceInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		await assertContact(tx, companyId, input.contactId, 'CUSTOMER');
		await assertInvoiceAccounts(tx, companyId, {
			receivableAccountId: input.receivableAccountId,
			taxAccountId: input.taxAccountId,
			revenueAccountIds: input.lines.map((l) => l.revenueAccountId)
		});

		const computedLines = computeLines(input.lines);
		const subtotal = sumMoney(computedLines.map((l) => l.amount));
		const taxAmount = input.taxRate ? toMoney(subtotal.times(input.taxRate).div(100)) : '0.00';
		const total = toMoney(subtotal.plus(taxAmount));

		const [row] = await tx
			.insert(invoices)
			.values({
				companyId,
				contactId: input.contactId,
				invoiceNo: null,
				issueDate: input.issueDate,
				receivableAccountId: input.receivableAccountId,
				status: 'DRAFT',
				subtotal: toMoney(subtotal),
				taxRate: input.taxRate ?? null,
				taxAccountId: input.taxAccountId ?? null,
				taxAmount,
				total,
				notes: input.notes || null,
				createdBy: userId
			})
			.returning({ id: invoices.id });

		await tx.insert(invoiceLines).values(
			computedLines.map((l, i) => ({
				invoiceId: row.id,
				lineNo: i + 1,
				description: l.description,
				quantity: l.quantity,
				unitPrice: l.unitPrice,
				amount: l.amount,
				revenueAccountId: l.revenueAccountId
			}))
		);

		return { id: row.id };
	});
}

export async function listInvoices(companyId: string): Promise<InvoiceListRow[]> {
	return db
		.select({
			id: invoices.id,
			invoiceNo: invoices.invoiceNo,
			issueDate: invoices.issueDate,
			status: invoices.status,
			total: invoices.total,
			contactId: invoices.contactId,
			contactName: contacts.name
		})
		.from(invoices)
		.innerJoin(contacts, and(eq(contacts.id, invoices.contactId), eq(contacts.companyId, companyId)))
		.where(eq(invoices.companyId, companyId))
		.orderBy(asc(invoices.issueDate));
}

export async function getInvoice(companyId: string, invoiceId: string): Promise<InvoiceDetail> {
	const row = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
	if (!row || row.companyId !== companyId) throw notFound('Invoice');
	const lines = await db
		.select()
		.from(invoiceLines)
		.where(eq(invoiceLines.invoiceId, invoiceId))
		.orderBy(asc(invoiceLines.lineNo));
	return { ...row, lines };
}

/** Kirim invoice Draft: beri nomor urut dan posting jurnal (Dr piutang / Cr pendapatan + PPN). */
export async function sendInvoice(companyId: string, userId: string, invoiceId: string, date: string): Promise<void> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);

		const invoice = await tx.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
		if (!invoice || invoice.companyId !== companyId) throw notFound('Invoice');
		if (invoice.status !== 'DRAFT') throw new ApiError(409, 'invalid_status', 'Invoice sudah bukan Draft');

		await assertPeriodOpen(tx, companyId, [date]);

		const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.lineNo));

		await assertInvoiceAccounts(tx, companyId, {
			receivableAccountId: invoice.receivableAccountId,
			taxAccountId: D(invoice.taxAmount).gt(0) ? invoice.taxAccountId : null,
			revenueAccountIds: lines.map((l) => l.revenueAccountId)
		});

		const invoiceNo = await nextDocumentNumber(tx, companyId, 'INV', date.slice(0, 4));

		const journalLineInputs: JournalLineInput[] = [
			{ accountId: invoice.receivableAccountId, debit: invoice.total, credit: '0.00' },
			...lines.map((l) => ({ accountId: l.revenueAccountId, debit: '0.00', credit: l.amount }))
		];
		if (D(invoice.taxAmount).gt(0)) {
			journalLineInputs.push({ accountId: invoice.taxAccountId!, debit: '0.00', credit: invoice.taxAmount });
		}

		await postJournal(tx, {
			companyId,
			entryDate: date,
			description: `Invoice ${invoiceNo}`,
			refNo: invoiceNo,
			createdBy: userId,
			lines: journalLineInputs,
			invoiceId
		});

		await tx.update(invoices).set({ invoiceNo, status: 'SENT' }).where(eq(invoices.id, invoiceId));
	});
}

/** Bayar invoice Terkirim lewat bank: posting jurnal pelunasan (Dr bank / Cr piutang) dan tandai Lunas. */
export async function payInvoiceByBank(companyId: string, userId: string, invoiceId: string, date: string): Promise<void> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);

		const invoice = await tx.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
		if (!invoice || invoice.companyId !== companyId) throw notFound('Invoice');
		if (invoice.status !== 'SENT') throw new ApiError(409, 'invalid_status', 'Invoice harus berstatus Terkirim untuk dibayar');

		await assertPeriodOpen(tx, companyId, [date]);

		const company = await tx.query.companies.findFirst({ where: eq(companies.id, companyId) });
		if (!company?.bankAccountId) throw new ApiError(409, 'bank_account_not_set', 'Akun bank perusahaan belum diatur di Pengaturan → Perusahaan');

		await postJournal(tx, {
			companyId,
			entryDate: date,
			refNo: invoice.invoiceNo!,
			description: `Pelunasan ${invoice.invoiceNo}`,
			createdBy: userId,
			lines: [
				{ accountId: company.bankAccountId, debit: invoice.total, credit: '0.00' },
				{ accountId: invoice.receivableAccountId, debit: '0.00', credit: invoice.total }
			],
			invoiceId
		});

		await tx.update(invoices).set({ status: 'PAID' }).where(eq(invoices.id, invoiceId));
	});
}

/**
 * Batalkan invoice: Draft cukup ubah status (tanpa jurnal), Terkirim/Lunas membalik jurnal yang
 * sudah diposting. Status awal dibaca sekali di luar lock untuk menentukan jalur mana yang berlaku
 * (Draft vs Terkirim/Lunas). Begitu company di-lock, status dibaca ulang:
 * - kalau sudah berubah dari Draft (misalnya `sendInvoice` menyusup di antara baca awal dan lock
 *   diperoleh), jalur Draft INI tidak diam-diam lanjut membalik jurnal (Task 7);
 * - otorisasi: route memutuskan role berdasarkan baca status-nya sendiri, yang bisa basi. Karena
 *   itu route meneruskan `callerIsAdmin` (role pemanggil yang sebenarnya), dan keputusan akhir
 *   diambil DI SINI, di bawah lock yang sama dengan baca ulang status: membatalkan invoice yang
 *   sudah diposting (Terkirim/Lunas) wajib admin -- pemanggil non-admin ditolak 403 `forbidden`
 *   meski cek role di route (yang melihat Draft) sudah lolos.
 */
export async function cancelInvoice(
	companyId: string,
	userId: string,
	invoiceId: string,
	opts: { callerIsAdmin: boolean }
): Promise<void> {
	const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
	if (!invoice || invoice.companyId !== companyId) throw notFound('Invoice');
	if (invoice.status === 'CANCELLED') throw new ApiError(409, 'invalid_status', 'Invoice sudah dibatalkan');

	if (invoice.status === 'DRAFT') {
		return db.transaction(async (tx) => {
			await tx.execute(sql`select id from companies where id = ${companyId} for update`);

			const current = await tx.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
			if (!current || current.companyId !== companyId) throw notFound('Invoice');
			if (current.status !== 'DRAFT') {
				if (isPostedInvoiceStatus(current.status) && !opts.callerIsAdmin) throw cancelPostedForbidden();
				throw new ApiError(409, 'invalid_status', 'Invoice sudah bukan Draft, muat ulang lalu coba batalkan lagi');
			}

			await tx.update(invoices).set({ status: 'CANCELLED' }).where(eq(invoices.id, invoiceId));
		});
	}

	return db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);

		const current = await tx.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
		if (!current || current.companyId !== companyId) throw notFound('Invoice');
		if (current.status === 'CANCELLED') throw new ApiError(409, 'invalid_status', 'Invoice sudah dibatalkan');
		if (!opts.callerIsAdmin) throw cancelPostedForbidden();

		await reverseJournalEntries(tx, { companyId, createdBy: userId, invoiceId, descriptionPrefix: 'Pembalikan' });

		await tx.update(invoices).set({ status: 'CANCELLED' }).where(eq(invoices.id, invoiceId));
	});
}

function isPostedInvoiceStatus(status: InvoiceDetail['status']): boolean {
	return status === 'SENT' || status === 'PAID';
}

function cancelPostedForbidden(): ApiError {
	return new ApiError(403, 'forbidden', 'Hanya admin yang dapat membatalkan invoice yang sudah dikirim atau lunas');
}
