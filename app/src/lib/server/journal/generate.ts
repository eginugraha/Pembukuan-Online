import { and, asc, count, eq, isNull, like, sql } from 'drizzle-orm';
import { ApiError, notFound } from '../api';
import { db, type Tx } from '../db';
import { companies, journalEntries, journalLines, statementUploads, transactions } from '../db/schema';
import { assertBalanced, buildTransactionLines } from './lines';

async function maxRefSeq(tx: Tx, companyId: string, yyyymm: string): Promise<number> {
	const [row] = await tx
		.select({ max: sql<number>`coalesce(max(cast(substring(${journalEntries.refNo} from 12) as integer)), 0)::int` })
		.from(journalEntries)
		.where(and(eq(journalEntries.companyId, companyId), like(journalEntries.refNo, `BCA-${yyyymm}-%`)));
	return row.max;
}

export async function generateJournal(companyId: string, uploadId: string, userId: string): Promise<{ created: number }> {
	return db.transaction(async (tx) => {
		// Serialisasi per perusahaan: mencegah entry ganda & nomor ref bentrok saat klik ganda.
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);

		const upload = await tx.query.statementUploads.findFirst({
			where: and(eq(statementUploads.id, uploadId), eq(statementUploads.companyId, companyId))
		});
		if (!upload) throw notFound('Upload');
		const company = await tx.query.companies.findFirst({ where: eq(companies.id, companyId) });
		if (!company?.bankAccountId) {
			throw new ApiError(409, 'bank_account_not_set', 'Akun bank perusahaan belum diatur di Pengaturan → Perusahaan');
		}

		const [{ pending }] = await tx
			.select({ pending: count() })
			.from(transactions)
			.where(and(eq(transactions.uploadId, uploadId), eq(transactions.isConfirmed, false)));
		if (pending > 0) {
			throw new ApiError(409, 'unconfirmed_transactions', `Masih ada ${pending} transaksi yang belum dikonfirmasi`);
		}

		const rows = await tx
			.select({
				id: transactions.id,
				txnDate: transactions.txnDate,
				description: transactions.description,
				debit: transactions.debit,
				credit: transactions.credit,
				accountId: transactions.accountId
			})
			.from(transactions)
			.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
			.where(and(eq(transactions.uploadId, uploadId), isNull(journalEntries.id)))
			.orderBy(asc(transactions.txnDate), asc(transactions.lineNo));

		const nextSeq = new Map<string, number>();
		for (const t of rows) {
			const yyyymm = t.txnDate.slice(0, 7).replace('-', '');
			if (!nextSeq.has(yyyymm)) nextSeq.set(yyyymm, (await maxRefSeq(tx, companyId, yyyymm)) + 1);
			const seq = nextSeq.get(yyyymm)!;
			nextSeq.set(yyyymm, seq + 1);

			const lines = buildTransactionLines(
				{ debit: t.debit, credit: t.credit, accountId: t.accountId! },
				company.bankAccountId
			);
			assertBalanced(lines);
			const [entry] = await tx
				.insert(journalEntries)
				.values({
					companyId,
					type: 'TRANSACTION',
					uploadId,
					transactionId: t.id,
					entryDate: t.txnDate,
					description: t.description,
					refNo: `BCA-${yyyymm}-${String(seq).padStart(4, '0')}`,
					createdBy: userId
				})
				.returning({ id: journalEntries.id });
			await tx.insert(journalLines).values(lines.map((l) => ({ journalId: entry.id, ...l })));
		}
		return { created: rows.length };
	});
}
