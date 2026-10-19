import { asc, eq, sql } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { CreateInvoiceInput, InvoiceLineInput } from '../../schemas/invoice';
import { assertAccountOfType } from './accounts';
import { assertLeafAccount } from '../accounts/queries';
import { ApiError, notFound } from '../api';
import { assertPeriodOpen } from '../closing/lock';
import { db, type Tx } from '../db';
import { contacts, invoiceLines, invoices } from '../db/schema';
import { nextDocumentNumber } from './numbering';
import { postJournal } from './posting';
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

async function computeLines(tx: Tx, companyId: string, lines: InvoiceLineInput[]) {
	const computed = [];
	for (const l of lines) {
		await assertAccountOfType(tx, companyId, l.revenueAccountId, 'REVENUE');
		computed.push({ ...l, amount: toMoney(D(l.quantity).times(l.unitPrice)) });
	}
	return computed;
}

/** Buat invoice Draft: akun divalidasi, subtotal/pajak/total dihitung di server, tanpa nomor dan tanpa jurnal. */
export async function createInvoice(
	companyId: string,
	userId: string,
	input: CreateInvoiceInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		await assertAccountOfType(tx, companyId, input.receivableAccountId, 'ASSET');
		if (input.taxAccountId) await assertLeafAccount(tx, companyId, input.taxAccountId);

		const computedLines = await computeLines(tx, companyId, input.lines);
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
		.innerJoin(contacts, eq(contacts.id, invoices.contactId))
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
