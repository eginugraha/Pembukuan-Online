import { asc, desc, eq, min, sql, and, ne } from 'drizzle-orm';
import { todayIso } from '../../dates';
import { dayAfter, fiscalYearEnd, fiscalYearLabel, fiscalYearStart } from '../../periods';
import { type Executor, db } from '../db';
import { fiscalClosings, journalEntries, user } from '../db/schema';
import { getCompanyReportInfo } from '../reports/company';
import { getIncomeStatement } from '../reports/income-statement';

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
	const rows: FiscalYearRow[] = [];
	let allPrevClosed = true;
	for (let start = fiscalYearStart(first.d, fiscalYear); start <= lastStart; start = dayAfter(fiscalYearEnd(start))) {
		const end = fiscalYearEnd(start);
		const c = closed.get(start);
		const ended = end < today;
		const { netProfit } = await getIncomeStatement(companyId, { from: start, to: end });
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
