import { and, eq, isNull } from 'drizzle-orm';
import { todayIso } from '../../dates';
import { assertPeriodOpen } from '../closing/lock';
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
	/**
	 * When true, only match entries whose OTHER back-link columns (the ones not passed above) are
	 * null -- i.e. match this id exclusively, not any entry that merely also carries it alongside
	 * a different back-link. Needed because a single back-link id can appear on more than one kind
	 * of entry: e.g. an advance receipt's id sits on its own creation entry (invoiceId null) AND on
	 * the entry posted when an invoice is paid via that receipt (invoiceId set), AND on that
	 * payment entry's own reversal if the invoice is later cancelled. Without this flag,
	 * `cancelAdvanceReceipt`'s `{advanceReceiptId}` filter would also re-reverse those
	 * invoice-linked entries every time the receipt is refunded. Pass `true` whenever the back-link
	 * id being reversed is known to double as a back-link on a different kind of entry.
	 */
	onlyUnlinked?: boolean;
}

// Not idempotent: calling this twice for the same back-link id(s) will also pick up and
// reverse the reversal entries created by the first call (they carry the same back-link
// columns), creating a second round of reversed-reversal entries. The ledger stays balanced
// either way, but callers must only invoke this once per cancellation.
export async function reverseJournalEntries(tx: Tx, params: ReverseJournalEntriesParams): Promise<void> {
	const backLinkFilters = [
		params.invoiceId !== undefined ? eq(journalEntries.invoiceId, params.invoiceId) : undefined,
		params.purchaseOrderId !== undefined ? eq(journalEntries.purchaseOrderId, params.purchaseOrderId) : undefined,
		params.advanceReceiptId !== undefined ? eq(journalEntries.advanceReceiptId, params.advanceReceiptId) : undefined
	].filter((f): f is NonNullable<typeof f> => f !== undefined);
	if (backLinkFilters.length === 0) {
		throw new Error('reverseJournalEntries requires at least one of invoiceId, purchaseOrderId, or advanceReceiptId');
	}

	const unlinkedFilters = params.onlyUnlinked
		? [
				params.invoiceId === undefined ? isNull(journalEntries.invoiceId) : undefined,
				params.purchaseOrderId === undefined ? isNull(journalEntries.purchaseOrderId) : undefined,
				params.advanceReceiptId === undefined ? isNull(journalEntries.advanceReceiptId) : undefined
			].filter((f): f is NonNullable<typeof f> => f !== undefined)
		: [];

	const today = todayIso();
	// Every journal posting -- including a reversal -- must respect the fiscal lock; reversals post
	// dated today, so that's the date checked here. Centralized here (rather than in each caller)
	// so Task 8/12's cancelAdvanceReceipt/cancelPurchaseOrder inherit this check automatically.
	await assertPeriodOpen(tx, params.companyId, [today]);

	const originals = await tx
		.select()
		.from(journalEntries)
		.where(and(eq(journalEntries.companyId, params.companyId), ...backLinkFilters, ...unlinkedFilters));

	for (const original of originals) {
		const lines = await tx.select().from(journalLines).where(eq(journalLines.journalId, original.id));
		await postJournal(tx, {
			companyId: params.companyId,
			createdBy: params.createdBy,
			entryDate: today,
			description: `${params.descriptionPrefix} ${original.refNo}`,
			// original.refNo is nullable in the schema; postJournal's refNo is required, so a null
			// here is coerced to '' rather than special-cased — no caller in this codebase posts
			// without a refNo, so this path isn't expected to be hit in practice.
			refNo: original.refNo ?? '',
			lines: lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit })),
			invoiceId: original.invoiceId ?? undefined,
			purchaseOrderId: original.purchaseOrderId ?? undefined,
			advanceReceiptId: original.advanceReceiptId ?? undefined
		});
	}
}
