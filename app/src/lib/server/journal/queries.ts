import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { sumMoney, toMoney } from '../../money';
import { db } from '../db';
import { accounts, journalEntries, journalLines, transactions } from '../db/schema';

export interface JournalEntryView {
	id: string;
	entryDate: string;
	refNo: string | null;
	description: string | null;
	type: 'OPENING' | 'TRANSACTION';
	lines: { lineId: string; accountId: string; accountCode: string; accountName: string; debit: string; credit: string; editable: boolean }[];
}

export async function listJournal(companyId: string, from: string, to: string) {
	const rows = await db
		.select({
			id: journalEntries.id,
			entryDate: journalEntries.entryDate,
			refNo: journalEntries.refNo,
			description: journalEntries.description,
			type: journalEntries.type,
			lineId: journalLines.id,
			accountId: accounts.id,
			transactionAccountId: transactions.accountId,
			accountCode: accounts.code,
			accountName: accounts.name,
			debit: journalLines.debit,
			credit: journalLines.credit
		})
		.from(journalEntries)
		.innerJoin(journalLines, eq(journalLines.journalId, journalEntries.id))
		.innerJoin(accounts, eq(accounts.id, journalLines.accountId))
		.leftJoin(transactions, eq(transactions.id, journalEntries.transactionId))
		.where(and(eq(journalEntries.companyId, companyId), gte(journalEntries.entryDate, from), lte(journalEntries.entryDate, to)))
		.orderBy(asc(journalEntries.entryDate), asc(journalEntries.refNo), desc(journalLines.debit));

	const entries: JournalEntryView[] = [];
	const byId = new Map<string, JournalEntryView>();
	for (const r of rows) {
		let entry = byId.get(r.id);
		if (!entry) {
			entry = { id: r.id, entryDate: r.entryDate, refNo: r.refNo, description: r.description, type: r.type, lines: [] };
			byId.set(r.id, entry);
			entries.push(entry);
		}
		// Hanya akun kategori jurnal transaksi yang bisa diubah (baris bank dan saldo awal terkunci).
		const editable = r.type === 'TRANSACTION' && r.transactionAccountId === r.accountId;
		entry.lines.push({ lineId: r.lineId, accountId: r.accountId, accountCode: r.accountCode, accountName: r.accountName, debit: r.debit, credit: r.credit, editable });
	}
	return {
		entries,
		totalDebit: toMoney(sumMoney(rows.map((r) => r.debit))),
		totalCredit: toMoney(sumMoney(rows.map((r) => r.credit)))
	};
}
