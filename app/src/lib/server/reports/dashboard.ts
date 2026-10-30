import { and, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { formatDate, monthRange } from '$lib/dates';
import { roleAtLeast, type Role } from '$lib/roles';
import { D, sumMoney, toMoney } from '../../money';
import { fiscalYearEnd, fiscalYearStart } from '../../periods';
import type Decimal from 'decimal.js';
import { hasOpeningBalance, pendingTransactionCount } from '../dashboard/next-step';
import { db } from '../db';
import { accounts, companies, journalEntries, journalLines, statementUploads, transactions } from '../db/schema';
import { listUploads } from '../uploads/service';
import { getCompanyReportInfo } from './company';
import { getBalanceSheet } from './balance-sheet';
import { getTrialBalance } from './trial-balance';

export interface DashboardAction {
	kind: 'review' | 'journal' | 'error' | 'balance_warning' | 'opening';
	label: string;
	detail: string;
	href: string;
}

export interface DashboardView {
	bank: { accountId: string; name: string; balance: string } | null;
	pendingCount: number;
	latestUpload: { id: string; accountNo: string; periodStart: string; periodEnd: string } | null;
	profitLoss: Array<{ month: string; revenue: string; expense: string; netProfit: string; future: boolean }>;
	composition: { expense: Composition; revenue: Composition };
	bankTrend: Array<{ month: string; balance: string }> | null;
	profitThisYear: string;
	/** Awal tahun buku yang memuat hari ini (mengikuti pengaturan perusahaan). */
	fiscalYearStart: string;
	balanced: boolean;
	recentTransactions: Array<{ id: string; txnDate: string; description: string; amount: string; accountName: string | null }>;
	actions: DashboardAction[];
}

// Role minimum untuk melihat tiap jenis aksi (halaman tujuan /uploads/:id terbuka untuk viewer,
// tetapi review, generate jurnal dan saldo awal butuh akuntan).
const ACTION_MIN_ROLE: Record<DashboardAction['kind'], Role> = {
	review: 'accountant',
	journal: 'accountant',
	opening: 'accountant',
	error: 'viewer',
	balance_warning: 'viewer'
};

export async function bankBalance(companyId: string, today: string): Promise<DashboardView['bank']> {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (!company?.bankAccountId) return null;
	const account = await db.query.accounts.findFirst({ where: eq(accounts.id, company.bankAccountId) });
	const [row] = await db
		.select({ total: sql<string>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)` })
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.where(and(eq(journalEntries.companyId, companyId), eq(journalLines.accountId, company.bankAccountId), lte(journalEntries.entryDate, today)));
	return { accountId: company.bankAccountId, name: account?.name ?? 'Bank', balance: toMoney(row.total) };
}

const monthKey = (y: number, m: number) => {
	const d = new Date(Date.UTC(y, m - 1, 1));
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** `count` bulan 'YYYY-MM' mulai dari bulan `start` ('YYYY-MM-DD'). */
function monthsFrom(start: string, count: number): string[] {
	const [y, m] = start.split('-').map(Number);
	return Array.from({ length: count }, (_, i) => monthKey(y, m + i));
}

export type CompositionSlice = { accountId: string | null; name: string; amount: string; percent: number };
type Composition = { slices: CompositionSlice[]; total: string };

function buildComposition(items: Array<{ accountId: string; name: string; amount: Decimal }>): Composition {
	const positive = items.filter((i) => i.amount.gt(0)).sort((a, b) => b.amount.comparedTo(a.amount));
	const top = positive.slice(0, 5).map((i) => ({ accountId: i.accountId as string | null, name: i.name, amount: i.amount }));
	const rest = sumMoney(positive.slice(5).map((i) => i.amount));
	if (rest.gt(0)) top.push({ accountId: null, name: 'Lainnya', amount: rest });
	const total = top.reduce((acc, i) => acc.plus(i.amount), D(0));
	return {
		slices: top.map((i) => ({
			accountId: i.accountId,
			name: i.name,
			amount: toMoney(i.amount),
			percent: total.isZero() ? 0 : Number(i.amount.div(total).times(100).toFixed(1))
		})),
		total: toMoney(total)
	};
}

/** Laba rugi 12 bulan tahun buku dan komposisi akun; aturan yang sama dengan reports/income-statement.ts. */
async function profitLossAndComposition(
	companyId: string,
	today: string
): Promise<Pick<DashboardView, 'profitLoss' | 'composition'>> {
	const { fiscalYear } = await getCompanyReportInfo(companyId);
	const start = fiscalYearStart(today, fiscalYear);
	const end = fiscalYearEnd(start);
	const months = monthsFrom(start, 12);
	const current = today.slice(0, 7);
	const queryTo = monthRange(today).to < end ? monthRange(today).to : end;

	const month = sql<string>`to_char(${journalEntries.entryDate}, 'YYYY-MM')`;
	const upToToday = sql<boolean>`${journalEntries.entryDate} <= ${today}`;
	const [accs, rows] = await Promise.all([
		db
			.select({ id: accounts.id, name: accounts.name, type: accounts.type, parentId: accounts.parentId })
			.from(accounts)
			.where(eq(accounts.companyId, companyId)),
		db
			.select({
				month,
				upToToday,
				accountId: journalLines.accountId,
				debit: sql<string>`sum(${journalLines.debit})`,
				credit: sql<string>`sum(${journalLines.credit})`
			})
			.from(journalLines)
			.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
			.where(
				and(
					eq(journalEntries.companyId, companyId),
					sql`${journalEntries.type} <> 'CLOSING'`,
					gte(journalEntries.entryDate, start),
					lte(journalEntries.entryDate, queryTo)
				)
			)
			.groupBy(sql`1, 2, 3`)
	]);

	const hasChildren = new Set(accs.map((a) => a.parentId).filter((p): p is string => p !== null));
	const leaf = new Map(accs.filter((a) => (a.type === 'REVENUE' || a.type === 'EXPENSE') && !hasChildren.has(a.id)).map((a) => [a.id, a]));

	const perMonth = new Map<string, { revenue: Decimal; expense: Decimal }>(months.map((m) => [m, { revenue: D(0), expense: D(0) }]));
	const comp = { REVENUE: new Map<string, Decimal>(), EXPENSE: new Map<string, Decimal>() };
	for (const r of rows) {
		const a = leaf.get(r.accountId);
		const bucket = perMonth.get(r.month);
		if (!a || !bucket) continue;
		const net = a.type === 'REVENUE' ? D(r.credit).minus(D(r.debit)) : D(r.debit).minus(D(r.credit));
		if (a.type === 'REVENUE') bucket.revenue = bucket.revenue.plus(net);
		else bucket.expense = bucket.expense.plus(net);
		if (r.upToToday) {
			const m = comp[a.type as 'REVENUE' | 'EXPENSE'];
			m.set(a.id, (m.get(a.id) ?? D(0)).plus(net));
		}
	}

	const profitLoss = months.map((m) => {
		const future = m > current;
		const b = future ? { revenue: D(0), expense: D(0) } : perMonth.get(m)!;
		return { month: m, revenue: toMoney(b.revenue), expense: toMoney(b.expense), netProfit: toMoney(b.revenue.minus(b.expense)), future };
	});
	const toItems = (m: Map<string, Decimal>) => [...m].map(([id, amount]) => ({ accountId: id, name: leaf.get(id)!.name, amount }));
	return { profitLoss, composition: { expense: buildComposition(toItems(comp.EXPENSE)), revenue: buildComposition(toItems(comp.REVENUE)) } };
}

/** Saldo kumulatif akun bank akhir tiap bulan, 12 bulan berakhir di bulan `today`. */
async function bankTrend(companyId: string, today: string): Promise<DashboardView['bankTrend']> {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (!company?.bankAccountId) return null;
	const [y, m] = today.split('-').map(Number);
	const months = monthsFrom(monthKey(y, m - 11) + '-01', 12);
	const first = `${months[0]}-01`;
	const bucket = sql<string>`case when ${journalEntries.entryDate} < ${first} then 'PRE' else to_char(${journalEntries.entryDate}, 'YYYY-MM') end`;
	const rows = await db
		.select({ bucket, net: sql<string>`sum(${journalLines.debit} - ${journalLines.credit})` })
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.where(and(eq(journalEntries.companyId, companyId), eq(journalLines.accountId, company.bankAccountId), lte(journalEntries.entryDate, today)))
		.groupBy(sql`1`);
	const byBucket = new Map(rows.map((r) => [r.bucket, D(r.net)]));
	let running = byBucket.get('PRE') ?? D(0);
	return months.map((mo) => {
		running = running.plus(byBucket.get(mo) ?? D(0));
		return { month: mo, balance: toMoney(running) };
	});
}

async function recentTransactions(companyId: string): Promise<DashboardView['recentTransactions']> {
	const rows = await db
		.select({
			id: transactions.id,
			txnDate: transactions.txnDate,
			description: transactions.description,
			debit: transactions.debit,
			credit: transactions.credit,
			accountName: accounts.name
		})
		.from(transactions)
		.innerJoin(statementUploads, eq(statementUploads.id, transactions.uploadId))
		.leftJoin(accounts, eq(accounts.id, transactions.accountId))
		.where(eq(transactions.companyId, companyId))
		.orderBy(desc(transactions.txnDate), desc(statementUploads.uploadedAt), desc(transactions.lineNo))
		.limit(8);
	return rows.map((r) => ({
		id: r.id,
		txnDate: r.txnDate,
		description: r.description,
		amount: toMoney(Number(r.credit) > 0 ? r.credit : `-${r.debit}`),
		accountName: r.accountName
	}));
}

async function uploadActions(companyId: string, opening: boolean): Promise<DashboardAction[]> {
	const [uploads, journaled] = await Promise.all([
		listUploads(companyId),
		db
			.selectDistinct({ uploadId: journalEntries.uploadId })
			.from(journalEntries)
			.where(and(eq(journalEntries.companyId, companyId), isNotNull(journalEntries.uploadId)))
	]);
	const journaledIds = new Set(journaled.map((j) => j.uploadId));
	const actions: DashboardAction[] = [];
	for (const u of uploads) {
		const href = `/uploads/${u.id}`;
		const period = `${formatDate(u.periodStart)} – ${formatDate(u.periodEnd)}`;
		if (u.status === 'error') {
			actions.push({ kind: 'error', label: 'Upload gagal diproses', detail: `${u.filename} · ${period}`, href });
			continue;
		}
		if (u.status !== 'processing' && u.pending > 0) {
			actions.push({ kind: 'review', label: `Review ${u.pending} transaksi`, detail: `Rekening ${u.accountNo} · ${period}`, href });
		} else if (u.status !== 'processing' && u.total > 0 && !journaledIds.has(u.id)) {
			actions.push({ kind: 'journal', label: 'Buat jurnal', detail: `Rekening ${u.accountNo} · ${period}`, href });
		}
		if (u.balanceWarning) {
			actions.push({ kind: 'balance_warning', label: 'Saldo awal berbeda', detail: `Rekening ${u.accountNo} · ${period}`, href });
		}
	}
	if (!opening) {
		actions.push({ kind: 'opening', label: 'Isi saldo awal', detail: 'Saldo awal belum diisi', href: '/settings/opening-balance' });
	}
	return actions;
}

export async function getDashboard(
	companyId: string,
	role: Role | null,
	today: string,
	/** Statistik yang sudah dihitung layout pada permintaan yang sama; bila ada, tidak dihitung ulang. */
	shared?: { pending: number; opening: boolean }
): Promise<DashboardView> {
	const opening = shared?.opening ?? (await hasOpeningBalance(companyId));
	const [bank, pendingCount, latest, pl, trend, bs, tb, recent, actions] = await Promise.all([
		bankBalance(companyId, today),
		shared ? Promise.resolve(shared.pending) : pendingTransactionCount(companyId),
		db.query.statementUploads.findFirst({
			columns: { id: true, accountNo: true, periodStart: true, periodEnd: true },
			where: eq(statementUploads.companyId, companyId),
			orderBy: [desc(statementUploads.periodEnd), desc(statementUploads.uploadedAt)]
		}),
		profitLossAndComposition(companyId, today),
		bankTrend(companyId, today),
		getBalanceSheet(companyId, today),
		// `balanced` tidak bergantung pada `from`, jadi awal bulan hanyalah rentang sembarang.
		getTrialBalance(companyId, { from: monthRange(today).from, to: today }),
		recentTransactions(companyId),
		uploadActions(companyId, opening)
	]);
	return {
		bank,
		pendingCount,
		latestUpload: latest ?? null,
		...pl,
		bankTrend: trend,
		profitThisYear: bs.profit.thisYear,
		fiscalYearStart: bs.fiscalYearStart,
		balanced: tb.balanced,
		recentTransactions: recent,
		actions: actions.filter((a) => roleAtLeast(role, ACTION_MIN_ROLE[a.kind]))
	};
}
