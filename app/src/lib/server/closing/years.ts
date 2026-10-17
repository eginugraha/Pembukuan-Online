import { and, asc, desc, eq, gte, inArray, lte, min, ne, sql } from 'drizzle-orm';
import { todayIso } from '../../dates';
import { D, toMoney } from '../../money';
import { dayAfter, fiscalYearEnd, fiscalYearLabel, fiscalYearStart } from '../../periods';
import { type Executor, db } from '../db';
import { accounts, fiscalClosings, journalEntries, journalLines, user } from '../db/schema';
import { getCompanyReportInfo } from '../reports/company';

export interface FiscalYearRow {
	periodStart: string;
	periodEnd: string;
	label: string;
	status: 'open' | 'closed';
	ended: boolean;
	netProfit: string;
	closedAt: string | null;
	closedByName: string | null;
	canClose: boolean;
	canReopen: boolean;
}

export async function lockedThrough(ex: Executor, companyId: string): Promise<{ periodEnd: string; label: string } | null> {
	const [row] = await ex
		.select({ periodStart: fiscalClosings.periodStart, periodEnd: fiscalClosings.periodEnd })
		.from(fiscalClosings)
		.where(eq(fiscalClosings.companyId, companyId))
		.orderBy(desc(fiscalClosings.periodEnd))
		.limit(1);
	if (!row) return null;
	return { periodEnd: row.periodEnd, label: fiscalYearLabel(row.periodStart, row.periodEnd) };
}

export async function listFiscalYears(companyId: string, today: string = todayIso()): Promise<FiscalYearRow[]> {
	const { fiscalYear } = await getCompanyReportInfo(companyId);
	const [first] = await db
		.select({ d: min(journalEntries.entryDate) })
		.from(journalEntries)
		.where(and(eq(journalEntries.companyId, companyId), ne(journalEntries.type, 'OPENING')));
	if (!first?.d) return [];

	const closings = await db
		.select({
			periodStart: fiscalClosings.periodStart,
			closedAt: fiscalClosings.closedAt,
			closedByName: user.name
		})
		.from(fiscalClosings)
		.leftJoin(user, eq(user.id, fiscalClosings.closedBy))
		.where(eq(fiscalClosings.companyId, companyId))
		.orderBy(asc(fiscalClosings.periodStart));
	const closed = new Map(closings.map((c) => [c.periodStart, c]));
	const latestClosed = closings.length ? closings[closings.length - 1].periodStart : null;

	const lastStart = fiscalYearStart(today, fiscalYear);
	const firstStart = fiscalYearStart(first.d, fiscalYear);

	// Laba bersih semua tahun sekaligus: satu query per tanggal (akun detail pendapatan/beban, tanpa jurnal penutup).
	const perDay = await db
		.select({
			d: journalEntries.entryDate,
			net: sql<string>`sum(${journalLines.credit} - ${journalLines.debit})`
		})
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.innerJoin(accounts, eq(accounts.id, journalLines.accountId))
		.where(
			and(
				eq(journalEntries.companyId, companyId),
				ne(journalEntries.type, 'CLOSING'),
				gte(journalEntries.entryDate, firstStart),
				lte(journalEntries.entryDate, fiscalYearEnd(lastStart)),
				inArray(accounts.type, ['REVENUE', 'EXPENSE']),
				sql`not exists (select 1 from accounts c where c.parent_id = ${accounts.id})`
			)
		)
		.groupBy(journalEntries.entryDate);
	const profitByYear = new Map<string, ReturnType<typeof D>>();
	for (const r of perDay) {
		const y = fiscalYearStart(r.d, fiscalYear);
		profitByYear.set(y, (profitByYear.get(y) ?? D(0)).plus(D(r.net)));
	}

	const rows: FiscalYearRow[] = [];
	let allPrevClosed = true;
	for (let start = firstStart; start <= lastStart; start = dayAfter(fiscalYearEnd(start))) {
		const end = fiscalYearEnd(start);
		const c = closed.get(start);
		const ended = end < today;
		const netProfit = toMoney(profitByYear.get(start) ?? D(0));
		rows.push({
			periodStart: start,
			periodEnd: end,
			label: fiscalYearLabel(start, end),
			status: c ? 'closed' : 'open',
			ended,
			netProfit,
			closedAt: c ? c.closedAt.toISOString() : null,
			closedByName: c?.closedByName ?? null,
			canClose: !c && ended && allPrevClosed,
			canReopen: !!c && start === latestClosed
		});
		if (!c) allPrevClosed = false;
	}
	return rows;
}
