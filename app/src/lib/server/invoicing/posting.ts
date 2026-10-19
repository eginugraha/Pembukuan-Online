import { and, eq } from 'drizzle-orm';
import { todayIso } from '../../dates';
import type { Tx } from '../db';
import { journalEntries, journalLines } from '../db/schema';
import { assertBalanced, type JournalLineInput } from '../journal/lines';

interface BackLinks {
	invoiceId?: string;
	purchaseOrderId?: string;
	advanceReceiptId?: string;
}

interface PostJournalParams extends BackLinks {
	companyId: string;
	entryDate: string;
	description: string;
	refNo: string;
	createdBy: string;
	lines: JournalLineInput[];
}

export async function postJournal(tx: Tx, params: PostJournalParams): Promise<{ id: string }> {
	assertBalanced(params.lines);
	const [entry] = await tx
		.insert(journalEntries)
		.values({
			companyId: params.companyId,
			type: 'TRANSACTION',
			entryDate: params.entryDate,
			description: params.description,
			refNo: params.refNo,
			createdBy: params.createdBy,
			invoiceId: params.invoiceId,
			purchaseOrderId: params.purchaseOrderId,
			advanceReceiptId: params.advanceReceiptId
		})
		.returning({ id: journalEntries.id });
	await tx.insert(journalLines).values(params.lines.map((l) => ({ journalId: entry.id, ...l })));
	return { id: entry.id };
}

interface ReverseJournalEntriesParams extends BackLinks {
	companyId: string;
	createdBy: string;
	descriptionPrefix: string;
}

export async function reverseJournalEntries(tx: Tx, params: ReverseJournalEntriesParams): Promise<void> {
	const backLinkFilter = params.invoiceId
		? eq(journalEntries.invoiceId, params.invoiceId)
		: params.purchaseOrderId
			? eq(journalEntries.purchaseOrderId, params.purchaseOrderId)
			: params.advanceReceiptId
				? eq(journalEntries.advanceReceiptId, params.advanceReceiptId)
				: undefined;
	if (!backLinkFilter) return;

	const originals = await tx
		.select()
		.from(journalEntries)
		.where(and(eq(journalEntries.companyId, params.companyId), backLinkFilter));

	for (const original of originals) {
		const lines = await tx.select().from(journalLines).where(eq(journalLines.journalId, original.id));
		await postJournal(tx, {
			companyId: params.companyId,
			createdBy: params.createdBy,
			entryDate: todayIso(),
			description: `${params.descriptionPrefix} ${original.refNo}`,
			refNo: original.refNo ?? '',
			lines: lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit })),
			invoiceId: original.invoiceId ?? undefined,
			purchaseOrderId: original.purchaseOrderId ?? undefined,
			advanceReceiptId: original.advanceReceiptId ?? undefined
		});
	}
}
