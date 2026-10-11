import { and, asc, eq, gte, lte, not } from 'drizzle-orm';
import { D, sumMoney, toMoney } from '../../money';
import { notFound } from '../api';
import { db } from '../db';
import { accounts, journalEntries, journalLines } from '../db/schema';
import { naturalBalanceAtStartOf, signedForNormal } from '../ledger/balance';

export async function getLedger(companyId: string, accountId: string, from: string, to: string) {
	const account = await db.query.accounts.findFirst({
		where: and(eq(accounts.id, accountId), eq(accounts.companyId, companyId))
	});
	if (!account) throw notFound('Akun');

	const opening = await naturalBalanceAtStartOf(db, companyId, accountId, from);
	const rows = await db
		.select({
			entryDate: journalEntries.entryDate,
			refNo: journalEntries.refNo,
			description: journalEntries.description,
			debit: journalLines.debit,
			credit: journalLines.credit
		})
		.from(journalLines)
		.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
		.where(
			and(
				eq(journalEntries.companyId, companyId),
				eq(journalLines.accountId, accountId),
				gte(journalEntries.entryDate, from),
				lte(journalEntries.entryDate, to),
				// OPENING bertanggal `from` sudah masuk saldo awal
				not(and(eq(journalEntries.type, 'OPENING'), eq(journalEntries.entryDate, from))!)
			)
		)
		.orderBy(asc(journalEntries.entryDate), asc(journalEntries.refNo), asc(journalLines.id));

	let running = D(opening);
	const lines = rows.map((r) => {
		running = running.plus(r.debit).minus(r.credit);
		return { ...r, balance: signedForNormal(running, account.normalBal) };
	});
	return {
		account: { id: account.id, code: account.code, name: account.name, normalBal: account.normalBal },
		openingBalance: signedForNormal(opening, account.normalBal),
		lines,
		totalDebit: toMoney(sumMoney(rows.map((r) => r.debit))),
		totalCredit: toMoney(sumMoney(rows.map((r) => r.credit))),
		closingBalance: signedForNormal(running, account.normalBal)
	};
}

export type LedgerView = Awaited<ReturnType<typeof getLedger>>;
