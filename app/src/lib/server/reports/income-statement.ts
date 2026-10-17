import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { shiftYears } from '../../periods';
import { db } from '../db';
import { accounts, journalEntries, journalLines } from '../db/schema';

export type IncomeSectionKey = 'revenue' | 'cogs' | 'opex' | 'otherIncome' | 'otherExpense' | 'tax';
export interface IncomeLine {
	accountId: string;
	code: string;
	name: string;
	amount: string;
}
export interface IncomeSection {
	key: IncomeSectionKey;
	title: string;
	lines: IncomeLine[];
	total: string;
}
export interface IncomeStatementView {
	from: string;
	to: string;
	sections: IncomeSection[];
	grossProfit: string;
	operatingProfit: string;
	profitBeforeTax: string;
	netProfit: string;
}

type Acc = { id: string; code: string; name: string; type: string; parentId: string | null };

const SECTIONS: Array<{ key: IncomeSectionKey; title: string }> = [
	{ key: 'revenue', title: 'Pendapatan Usaha' },
	{ key: 'cogs', title: 'Beban Pokok Pendapatan' },
	{ key: 'opex', title: 'Beban Operasional' },
	{ key: 'otherIncome', title: 'Pendapatan Lain-lain' },
	{ key: 'otherExpense', title: 'Beban Lain-lain' },
	{ key: 'tax', title: 'Beban Pajak Penghasilan' }
];

type Sums = Map<string, { debit: string; credit: string }>;

async function loadAccounts(companyId: string): Promise<Acc[]> {
	return db
		.select({ id: accounts.id, code: accounts.code, name: accounts.name, type: accounts.type, parentId: accounts.parentId })
		.from(accounts)
		.where(eq(accounts.companyId, companyId))
		.orderBy(accounts.code);
}

/** Jumlah debit/kredit per akun pada rentang; jurnal penutup tidak ikut dihitung. */
async function loadSums(companyId: string, range: { from: string; to: string }): Promise<Sums> {
	const rows = await db
		.select({
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
				gte(journalEntries.entryDate, range.from),
				lte(journalEntries.entryDate, range.to)
			)
		)
		.groupBy(journalLines.accountId);
	return new Map(rows.map((r) => [r.accountId, r]));
}

/** Laporan Laba Rugi (format vertikal PSAK) untuk rentang tanggal; semua tipe jurnal ikut dihitung. */
export async function getIncomeStatement(
	companyId: string,
	range: { from: string; to: string },
	opts: { keep?: Set<string> } = {}
): Promise<IncomeStatementView> {
	const [accs, sums] = await Promise.all([loadAccounts(companyId), loadSums(companyId, range)]);
	return buildView(accs, sums, range, opts.keep);
}

function buildView(accs: Acc[], sums: Sums, range: { from: string; to: string }, keep?: Set<string>): IncomeStatementView {
	const byId = new Map(accs.map((a) => [a.id, a]));
	const hasChildren = new Set(accs.map((a) => a.parentId).filter((p): p is string => p !== null));
	// Grup level-1: leluhur yang induknya root; akun root atau anak root menjadi grupnya sendiri.
	const groupOf = (a: Acc): Acc => {
		let cur = a;
		while (cur.parentId) {
			const parent = byId.get(cur.parentId);
			if (!parent || parent.parentId === null) break;
			cur = parent;
		}
		return cur;
	};

	const buckets = new Map<IncomeSectionKey, IncomeLine[]>(SECTIONS.map((s) => [s.key, []]));
	for (const a of accs) {
		if ((a.type !== 'REVENUE' && a.type !== 'EXPENSE') || hasChildren.has(a.id)) continue;
		const s = sums.get(a.id);
		const debit = D(s?.debit ?? 0);
		const credit = D(s?.credit ?? 0);
		const amount = a.type === 'REVENUE' ? credit.minus(debit) : debit.minus(credit);
		if (amount.isZero() && !keep?.has(a.id)) continue;
		const group = groupOf(a).code;
		let key: IncomeSectionKey;
		if (a.type === 'EXPENSE') {
			if (/pajak penghasilan/i.test(a.name)) key = 'tax';
			else if (/^\d+-1/.test(group)) key = 'cogs';
			else if (/^\d+-2/.test(group)) key = 'opex';
			else key = 'otherExpense';
		} else key = /^\d+-1/.test(group) ? 'revenue' : 'otherIncome';
		buckets.get(key)!.push({ accountId: a.id, code: a.code, name: a.name, amount: toMoney(amount) });
	}

	const sections: IncomeSection[] = SECTIONS.map((s) => {
		const lines = buckets.get(s.key)!;
		return { ...s, lines, total: toMoney(sumMoney(lines.map((l) => l.amount))) };
	});
	const t = (k: IncomeSectionKey) => D(sections.find((s) => s.key === k)!.total);
	const grossProfit = t('revenue').minus(t('cogs'));
	const operatingProfit = grossProfit.minus(t('opex'));
	const profitBeforeTax = operatingProfit.plus(t('otherIncome')).minus(t('otherExpense'));
	const netProfit = profitBeforeTax.minus(t('tax'));
	return {
		from: range.from,
		to: range.to,
		sections,
		grossProfit: toMoney(grossProfit),
		operatingProfit: toMoney(operatingProfit),
		profitBeforeTax: toMoney(profitBeforeTax),
		netProfit: toMoney(netProfit)
	};
}

/** Laba rugi untuk `range` beserta periode yang sama setahun sebelumnya, dengan baris identik di kedua kolom. */
export async function getIncomeStatementComparative(
	companyId: string,
	range: { from: string; to: string }
): Promise<{ current: IncomeStatementView; comparative: IncomeStatementView }> {
	const compRange = { from: shiftYears(range.from, -1), to: shiftYears(range.to, -1) };
	const [accs, curSums, cmpSums] = await Promise.all([loadAccounts(companyId), loadSums(companyId, range), loadSums(companyId, compRange)]);
	const keep = new Set<string>();
	for (const [sums, r] of [[curSums, range], [cmpSums, compRange]] as const)
		for (const s of buildView(accs, sums, r).sections) for (const l of s.lines) keep.add(l.accountId);
	return { current: buildView(accs, curSums, range, keep), comparative: buildView(accs, cmpSums, compRange, keep) };
}
