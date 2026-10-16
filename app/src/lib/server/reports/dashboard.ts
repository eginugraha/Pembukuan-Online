import { and, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { formatDate, monthRange } from '$lib/dates';
import { roleAtLeast, type Role } from '$lib/roles';
import { toMoney } from '../../money';
import { hasOpeningBalance, pendingTransactionCount } from '../dashboard/next-step';
import { db } from '../db';
import { accounts, companies, journalEntries, journalLines, statementUploads, transactions } from '../db/schema';
import { listUploads } from '../uploads/service';
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
	monthly: Array<{ month: string; income: string; expense: string }>;
	profitThisYear: string;
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

/** Enam bulan 'YYYY-MM' berakhir di bulan `today`, terlama dulu. */
function lastSixMonths(today: string): string[] {
	const [y, m] = today.split('-').map(Number);
	return Array.from({ length: 6 }, (_, i) => {
		const d = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
		return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	});
}

async function bankBalance(companyId: string, today: string): Promise<DashboardView['bank']> {
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

async function monthlyFlows(companyId: string, today: string): Promise<DashboardView['monthly']> {
	const months = lastSixMonths(today);
	const month = sql<string>`to_char(${transactions.txnDate}, 'YYYY-MM')`;
	const rows = await db
		.select({ month, income: sql<string>`sum(${transactions.credit})`, expense: sql<string>`sum(${transactions.debit})` })
		.from(transactions)
		.where(and(eq(transactions.companyId, companyId), gte(transactions.txnDate, `${months[0]}-01`), lte(transactions.txnDate, monthRange(today).to)))
		.groupBy(month);
	const byMonth = new Map(rows.map((r) => [r.month, r]));
	return months.map((m) => ({ month: m, income: toMoney(byMonth.get(m)?.income ?? 0), expense: toMoney(byMonth.get(m)?.expense ?? 0) }));
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

export async function getDashboard(companyId: string, role: Role | null, today: string): Promise<DashboardView> {
	const opening = await hasOpeningBalance(companyId);
	const [bank, pendingCount, latest, monthly, bs, tb, recent, actions] = await Promise.all([
		bankBalance(companyId, today),
		pendingTransactionCount(companyId),
		db.query.statementUploads.findFirst({
			columns: { id: true, accountNo: true, periodStart: true, periodEnd: true },
			where: eq(statementUploads.companyId, companyId),
			orderBy: [desc(statementUploads.periodEnd), desc(statementUploads.uploadedAt)]
		}),
		monthlyFlows(companyId, today),
		getBalanceSheet(companyId, today),
		getTrialBalance(companyId, today),
		recentTransactions(companyId),
		uploadActions(companyId, opening)
	]);
	const profit = bs.equity.lines.find((l) => l.accountId === null && l.name === 'Laba (Rugi) Tahun Berjalan');
	return {
		bank,
		pendingCount,
		latestUpload: latest ?? null,
		monthly,
		profitThisYear: profit?.amount ?? '0.00',
		balanced: tb.balanced,
		recentTransactions: recent,
		actions: actions.filter((a) => roleAtLeast(role, ACTION_MIN_ROLE[a.kind]))
	};
}
