import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { db } from '../db';
import { fiscalYearStart } from '../../periods';
import { accounts, companies, journalEntries, journalLines } from '../db/schema';

export { fiscalYearStart } from '../../periods';

export interface BalanceSheetLine {
	accountId: string | null;
	code: string | null;
	name: string;
	amount: string;
	children: BalanceSheetLine[];
}
export interface BalanceSheetSection {
	title: string;
	lines: BalanceSheetLine[];
	total: string;
}

type Acc = { id: string; code: string; name: string; type: string; parentId: string | null };

/** Grup level-1 berkode X-1xxx (Aset Lancar, Liabilitas Jangka Pendek) dianggap lancar. */
const isCurrentGroup = (code: string) => /^\d+-1/.test(code);

/**
 * Laporan Posisi Keuangan per `asOf` (format vertikal PSAK). Belum ada jurnal penutup, jadi
 * laba rugi dihitung dari akun pendapatan/beban: tahun buku berjalan dan tahun-tahun sebelumnya.
 */
export async function getBalanceSheet(companyId: string, asOf: string) {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	const fyStart = fiscalYearStart(asOf, company?.fiscalYear ?? 'JANUARY');

	const accs: Acc[] = await db
		.select({ id: accounts.id, code: accounts.code, name: accounts.name, type: accounts.type, parentId: accounts.parentId })
		.from(accounts)
		.where(eq(accounts.companyId, companyId))
		.orderBy(accounts.code);

	const naturalSince = async (from: string | null) => {
		const rows = await db
			.select({ accountId: journalLines.accountId, natural: sql<string>`sum(${journalLines.debit} - ${journalLines.credit})` })
			.from(journalLines)
			.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
			.where(
				and(
					eq(journalEntries.companyId, companyId),
					lte(journalEntries.entryDate, asOf),
					from ? gte(journalEntries.entryDate, from) : undefined
				)
			)
			.groupBy(journalLines.accountId);
		return new Map(rows.map((r) => [r.accountId, r.natural]));
	};
	const natural = await naturalSince(null);
	const naturalThisYear = await naturalSince(fyStart);

	const children = new Map<string | null, Acc[]>();
	for (const a of accs) children.set(a.parentId, [...(children.get(a.parentId) ?? []), a]);

	// sign: +1 untuk aset (saldo debit positif), -1 untuk liabilitas/ekuitas (saldo kredit positif).
	const toLine = (a: Acc, sign: 1 | -1): BalanceSheetLine | null => {
		const kids = (children.get(a.id) ?? []).map((c) => toLine(c, sign)).filter((l): l is BalanceSheetLine => l !== null);
		const own = D(natural.get(a.id) ?? 0).times(sign);
		const amount = sumMoney([own, ...kids.map((k) => k.amount)]);
		if (amount.isZero() && kids.length === 0) return null;
		return { accountId: a.id, code: a.code, name: a.name, amount: toMoney(amount), children: kids };
	};

	const section = (title: string, lines: BalanceSheetLine[]): BalanceSheetSection => ({
		title,
		lines,
		total: toMoney(sumMoney(lines.map((l) => l.amount)))
	});

	// Grup pertama sebuah seksi (mis. "Aset Lancar") tidak ditampilkan sebagai baris; anaknya langsung jadi baris seksi.
	const sectionLines = (groups: Acc[], sign: 1 | -1): BalanceSheetLine[] =>
		groups.flatMap((g, i) => {
			const line = toLine(g, sign);
			if (!line) return [];
			return i === 0 && line.children.length > 0 ? line.children : [line];
		});

	const roots = (type: string) => (children.get(null) ?? []).filter((a) => a.type === type);
	const level1 = (type: string) => roots(type).flatMap((r) => ((children.get(r.id) ?? []).length > 0 ? children.get(r.id)! : [r]));
	const split = (type: string, sign: 1 | -1) => {
		const groups = level1(type);
		return {
			current: sectionLines(groups.filter((g) => isCurrentGroup(g.code)), sign),
			nonCurrent: sectionLines(groups.filter((g) => !isCurrentGroup(g.code)), sign)
		};
	};

	const a = split('ASSET', 1);
	const assetsCurrent = section('Aset Lancar', a.current);
	const assetsNonCurrent = section('Aset Tidak Lancar', a.nonCurrent);
	const l = split('LIABILITY', -1);
	const liabCurrent = section('Liabilitas Jangka Pendek', l.current);
	const liabNonCurrent = section('Liabilitas Jangka Panjang', l.nonCurrent);

	const profitOf = (balances: Map<string, string>) =>
		sumMoney(accs.filter((x) => x.type === 'REVENUE' || x.type === 'EXPENSE').map((x) => balances.get(x.id) ?? 0)).neg();
	const profitTotal = profitOf(natural);
	const profitThisYear = profitOf(naturalThisYear);
	const synthetic = (name: string, amount: ReturnType<typeof D>): BalanceSheetLine[] =>
		amount.isZero() ? [] : [{ accountId: null, code: null, name, amount: toMoney(amount), children: [] }];
	const equity = section('Ekuitas', [
		...level1('EQUITY').map((g) => toLine(g, -1)).filter((x): x is BalanceSheetLine => x !== null),
		...synthetic('Laba (Rugi) Tahun-tahun Lalu', profitTotal.minus(profitThisYear)),
		...synthetic('Laba (Rugi) Tahun Berjalan', profitThisYear)
	]);

	const totalAssets = sumMoney([assetsCurrent.total, assetsNonCurrent.total]);
	const totalLiabilities = sumMoney([liabCurrent.total, liabNonCurrent.total]);
	const totalLiabEquity = totalLiabilities.plus(equity.total);
	return {
		asOf,
		fiscalYearStart: fyStart,
		assets: { current: assetsCurrent, nonCurrent: assetsNonCurrent, total: toMoney(totalAssets) },
		liabilities: { current: liabCurrent, nonCurrent: liabNonCurrent, total: toMoney(totalLiabilities) },
		equity,
		/** Laba rugi yang belum ditutup: tahun buku berjalan dan tahun-tahun sebelumnya (sudah termasuk di baris ekuitas). */
		profit: { thisYear: toMoney(profitThisYear), priorYears: toMoney(profitTotal.minus(profitThisYear)) },
		totalLiabilitiesAndEquity: toMoney(totalLiabEquity),
		balanced: totalAssets.eq(totalLiabEquity)
	};
}

export type BalanceSheetView = Awaited<ReturnType<typeof getBalanceSheet>>;
