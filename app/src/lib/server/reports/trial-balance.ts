import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { db } from '../db';
import { accounts, journalEntries, journalLines } from '../db/schema';

export async function getTrialBalance(companyId: string, asOf: string) {
	const sums = await db
		.select({
			accountId: accounts.id,
			code: accounts.code,
			name: accounts.name,
			natural: sql<string>`sum(${journalLines.debit} - ${journalLines.credit})`
		})
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.innerJoin(accounts, eq(accounts.id, journalLines.accountId))
		.where(and(eq(journalEntries.companyId, companyId), lte(journalEntries.entryDate, asOf)))
		.groupBy(accounts.id, accounts.code, accounts.name)
		.orderBy(asc(accounts.code));

	const rows = sums
		.filter((s) => !D(s.natural).isZero())
		.map((s) => {
			const n = D(s.natural);
			return {
				accountId: s.accountId,
				code: s.code,
				name: s.name,
				debit: toMoney(n.gt(0) ? n : 0),
				credit: toMoney(n.lt(0) ? n.neg() : 0)
			};
		});
	const totalDebit = sumMoney(rows.map((r) => r.debit));
	const totalCredit = sumMoney(rows.map((r) => r.credit));
	return {
		asOf,
		rows,
		totalDebit: toMoney(totalDebit),
		totalCredit: toMoney(totalCredit),
		balanced: totalDebit.eq(totalCredit)
	};
}

export type TrialBalanceView = Awaited<ReturnType<typeof getTrialBalance>>;
