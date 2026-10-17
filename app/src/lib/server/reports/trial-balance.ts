import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { db } from '../db';
import { accounts, journalEntries, journalLines } from '../db/schema';

export interface TrialBalanceRow {
	accountId: string;
	code: string;
	name: string;
	openingDebit: string;
	openingCredit: string;
	debit: string;
	credit: string;
	closingDebit: string;
	closingCredit: string;
}

export async function getTrialBalance(
	companyId: string,
	range: { from: string; to: string },
	opts: { includeClosing?: boolean } = {}
) {
	const { from, to } = range;
	const net = sql`(${journalLines.debit} - ${journalLines.credit})`;
	const isOpening = sql`(${journalEntries.entryDate} < ${from} OR ${journalEntries.type} = 'OPENING')`;
	const skipTypes = opts.includeClosing ? sql`${journalEntries.type} <> 'OPENING'` : sql`${journalEntries.type} NOT IN ('OPENING', 'CLOSING')`;
	const isMovement = sql`(${skipTypes} AND ${journalEntries.entryDate} >= ${from})`;
	const sums = await db
		.select({
			accountId: accounts.id,
			code: accounts.code,
			name: accounts.name,
			opening: sql<string>`coalesce(sum(CASE WHEN ${isOpening} THEN ${net} ELSE 0 END), 0)`,
			debit: sql<string>`coalesce(sum(CASE WHEN ${isMovement} THEN ${journalLines.debit} ELSE 0 END), 0)`,
			credit: sql<string>`coalesce(sum(CASE WHEN ${isMovement} THEN ${journalLines.credit} ELSE 0 END), 0)`
		})
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.innerJoin(accounts, eq(accounts.id, journalLines.accountId))
		.where(and(eq(journalEntries.companyId, companyId), lte(journalEntries.entryDate, to)))
		.groupBy(accounts.id, accounts.code, accounts.name)
		.orderBy(asc(accounts.code));

	const rows: TrialBalanceRow[] = [];
	for (const s of sums) {
		const opening = D(s.opening);
		const debit = D(s.debit);
		const credit = D(s.credit);
		const closing = opening.plus(debit).minus(credit);
		if (opening.isZero() && debit.isZero() && credit.isZero()) continue;
		rows.push({
			accountId: s.accountId,
			code: s.code,
			name: s.name,
			openingDebit: toMoney(opening.gt(0) ? opening : 0),
			openingCredit: toMoney(opening.lt(0) ? opening.neg() : 0),
			debit: toMoney(debit),
			credit: toMoney(credit),
			closingDebit: toMoney(closing.gt(0) ? closing : 0),
			closingCredit: toMoney(closing.lt(0) ? closing.neg() : 0)
		});
	}
	const sum = (k: keyof TrialBalanceRow) => sumMoney(rows.map((r) => r[k]));
	const t = {
		openingDebit: sum('openingDebit'),
		openingCredit: sum('openingCredit'),
		debit: sum('debit'),
		credit: sum('credit'),
		closingDebit: sum('closingDebit'),
		closingCredit: sum('closingCredit')
	};
	return {
		from,
		to,
		rows,
		totals: {
			openingDebit: toMoney(t.openingDebit),
			openingCredit: toMoney(t.openingCredit),
			debit: toMoney(t.debit),
			credit: toMoney(t.credit),
			closingDebit: toMoney(t.closingDebit),
			closingCredit: toMoney(t.closingCredit)
		},
		balanced: t.openingDebit.eq(t.openingCredit) && t.debit.eq(t.credit) && t.closingDebit.eq(t.closingCredit)
	};
}

export type TrialBalanceView = Awaited<ReturnType<typeof getTrialBalance>>;
