import { and, eq } from 'drizzle-orm';
import { todayIso } from '../../dates';
import { assertPeriodOpen } from '../closing/lock';
import type { Tx } from '../db';
import { journalEntries, journalLines } from '../db/schema';
import { assertBalanced, type JournalLineInput } from '../journal/lines';

interface BackLinks {
	invoiceId?: string;
	purchaseOrderId?: string;
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
			purchaseOrderId: params.purchaseOrderId
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

// Not idempotent: calling this twice for the same back-link id(s) will also pick up and
// reverse the reversal entries created by the first call (they carry the same back-link
// columns), creating a second round of reversed-reversal entries. The ledger stays balanced
// either way, but callers must only invoke this once per cancellation.
export async function reverseJournalEntries(tx: Tx, params: ReverseJournalEntriesParams): Promise<void> {
	const backLinkFilters = [
		params.invoiceId !== undefined ? eq(journalEntries.invoiceId, params.invoiceId) : undefined,
		params.purchaseOrderId !== undefined ? eq(journalEntries.purchaseOrderId, params.purchaseOrderId) : undefined
	].filter((f): f is NonNullable<typeof f> => f !== undefined);
	if (backLinkFilters.length === 0) {
		throw new Error('reverseJournalEntries requires at least one of invoiceId or purchaseOrderId');
	}

	const today = todayIso();
	// Every journal posting -- including a reversal -- must respect the fiscal lock; reversals post
	// dated today, so that's the date checked here. Centralized here (rather than in each caller)
	// so Task 12's cancelPurchaseOrder inherits this check automatically.
	await assertPeriodOpen(tx, params.companyId, [today]);

	const originals = await tx
		.select()
		.from(journalEntries)
		.where(and(eq(journalEntries.companyId, params.companyId), ...backLinkFilters));

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
			purchaseOrderId: original.purchaseOrderId ?? undefined
		});
	}
}
