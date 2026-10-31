import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Currency } from '../../currency';
import { D, toMoney } from '../../money';
import { todayIso } from '../../dates';
import { db } from '../db';
import { arApEntries, arApTerms } from '../db/schema';
import { bankBalance } from '../reports/dashboard';

export interface ArApSummary {
	ar: Record<Currency, string>;
	ap: Record<Currency, string>;
	bank: { name: string; balance: string } | null;
	/** IDR = saldo bank + AR - AP (tanpa saldo bank bila `bank === null`); USD selalu tanpa saldo bank. */
	net: Record<Currency, string>;
}

/** Total piutang/hutang belum lunas per mata uang, saldo bank, dan posisi bersih. */
export async function getArApSummary(companyId: string): Promise<ArApSummary> {
	const [rows, bank] = await Promise.all([
		db
			.select({
				kind: arApEntries.kind,
				currency: arApEntries.currency,
				total: sql<string>`coalesce(sum(${arApTerms.amount}), 0)`
			})
			.from(arApTerms)
			.innerJoin(arApEntries, eq(arApEntries.id, arApTerms.entryId))
			.where(and(eq(arApEntries.companyId, companyId), isNull(arApEntries.deletedAt), eq(arApTerms.paid, false)))
			.groupBy(arApEntries.kind, arApEntries.currency),
		bankBalance(companyId, todayIso())
	]);
	const pick = (kind: 'AR' | 'AP', currency: Currency) =>
		D(rows.find((r) => r.kind === kind && r.currency === currency)?.total ?? '0');
	const ar = { IDR: pick('AR', 'IDR'), USD: pick('AR', 'USD') };
	const ap = { IDR: pick('AP', 'IDR'), USD: pick('AP', 'USD') };
	const bankIdr = D(bank?.balance ?? '0');
	return {
		ar: { IDR: toMoney(ar.IDR), USD: toMoney(ar.USD) },
		ap: { IDR: toMoney(ap.IDR), USD: toMoney(ap.USD) },
		bank: bank ? { name: bank.name, balance: bank.balance } : null,
		net: { IDR: toMoney(bankIdr.plus(ar.IDR).minus(ap.IDR)), USD: toMoney(ar.USD.minus(ap.USD)) }
	};
}
