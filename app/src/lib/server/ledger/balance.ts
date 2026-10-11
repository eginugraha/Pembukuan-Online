import { and, eq, lt, or, sql } from 'drizzle-orm';
import { D, toMoney, type MoneyValue } from '../../money';
import type { Executor } from '../db';
import { accounts, journalEntries, journalLines } from '../db/schema';

/** Σdebit − Σkredit akun pada awal hari `date` (entry sebelum `date`, plus jurnal OPENING bertanggal `date`). */
export async function naturalBalanceAtStartOf(
	ex: Executor,
	companyId: string,
	accountId: string,
	date: string
): Promise<string> {
	const [row] = await ex
		.select({ total: sql<string>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)` })
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.where(
			and(
				eq(journalEntries.companyId, companyId),
				eq(journalLines.accountId, accountId),
				or(
					lt(journalEntries.entryDate, date),
					and(eq(journalEntries.type, 'OPENING'), eq(journalEntries.entryDate, date))
				)
			)
		);
	return toMoney(row.total);
}

export function signedForNormal(natural: MoneyValue, normalBal: 'DEBIT' | 'CREDIT'): string {
	return toMoney(normalBal === 'DEBIT' ? D(natural) : D(natural).neg());
}

export async function balanceAtStartOf(ex: Executor, companyId: string, accountId: string, date: string): Promise<string> {
	const account = await ex.query.accounts.findFirst({ where: eq(accounts.id, accountId) });
	const natural = await naturalBalanceAtStartOf(ex, companyId, accountId, date);
	return signedForNormal(natural, account?.normalBal ?? 'DEBIT');
}
