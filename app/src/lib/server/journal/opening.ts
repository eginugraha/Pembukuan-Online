import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { isZero, toMoney } from '../../money';
import { assertLeafAccount } from '../accounts/queries';
import { ApiError } from '../api';
import { db } from '../db';
import { journalEntries, journalLines } from '../db/schema';
import { isoDate, moneyString } from '../validation';
import { assertBalanced, type JournalLineInput } from './lines';

export const OpeningInput = z.object({
	date: isoDate,
	lines: z.array(z.object({ accountId: z.uuid(), debit: moneyString, credit: moneyString }))
});
export type OpeningInput = z.infer<typeof OpeningInput>;

export async function getOpening(companyId: string): Promise<{ date: string; lines: JournalLineInput[] } | null> {
	const entry = await db.query.journalEntries.findFirst({
		where: and(eq(journalEntries.companyId, companyId), eq(journalEntries.type, 'OPENING'))
	});
	if (!entry) return null;
	const lines = await db
		.select({ accountId: journalLines.accountId, debit: journalLines.debit, credit: journalLines.credit })
		.from(journalLines)
		.where(eq(journalLines.journalId, entry.id))
		.orderBy(asc(journalLines.id));
	return { date: entry.entryDate, lines };
}

export async function saveOpening(companyId: string, userId: string, input: OpeningInput): Promise<{ id: string }> {
	const lines = input.lines
		.filter((l) => !isZero(l.debit) || !isZero(l.credit))
		.map((l) => ({ accountId: l.accountId, debit: toMoney(l.debit), credit: toMoney(l.credit) }));
	if (lines.length === 0) throw new ApiError(422, 'empty_opening', 'Isi minimal satu saldo akun');
	assertBalanced(lines);

	return db.transaction(async (tx) => {
		for (const l of lines) await assertLeafAccount(tx, companyId, l.accountId);
		await tx
			.delete(journalEntries)
			.where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.type, 'OPENING')));
		const [entry] = await tx
			.insert(journalEntries)
			.values({
				companyId,
				type: 'OPENING',
				entryDate: input.date,
				description: 'Saldo Awal',
				refNo: 'OPENING',
				createdBy: userId
			})
			.returning({ id: journalEntries.id });
		await tx.insert(journalLines).values(lines.map((l) => ({ journalId: entry.id, ...l })));
		return entry;
	});
}
