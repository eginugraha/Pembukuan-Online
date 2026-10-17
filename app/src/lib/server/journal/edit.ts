import { and, eq, sql } from 'drizzle-orm';
import { assertCategoryAccount } from '../accounts/queries';
import { ApiError, notFound } from '../api';
import { db } from '../db';
import { journalEntries, journalLines, transactions } from '../db/schema';

/**
 * Ubah akun kategori sebuah jurnal transaksi (koreksi). Hanya baris kategori yang berpindah:
 * baris bank, tanggal, dan nominal tetap, sehingga jurnal tetap seimbang. Kategori di data transaksi
 * ikut diperbarui agar Review, detail upload, dan jurnal tidak saling berbeda.
 */
export async function updateJournalAccount(companyId: string, userId: string, entryId: string, accountId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);
		const entry = await tx.query.journalEntries.findFirst({
			where: and(eq(journalEntries.id, entryId), eq(journalEntries.companyId, companyId))
		});
		if (!entry) throw notFound('Jurnal');
		if (entry.type !== 'TRANSACTION' || !entry.transactionId) {
			throw new ApiError(409, 'journal_not_editable', 'Jurnal saldo awal diubah lewat halaman Saldo Awal');
		}
		const txn = await tx.query.transactions.findFirst({ where: eq(transactions.id, entry.transactionId) });
		if (!txn?.accountId) throw new ApiError(409, 'journal_not_editable', 'Jurnal ini tidak punya akun kategori');

		try {
			await assertCategoryAccount(tx, companyId, accountId);
		} catch (e) {
			if (e instanceof ApiError) throw new ApiError(e.status, e.code, e.message, e.details, { field: 'accountId' });
			throw e;
		}
		if (txn.accountId === accountId) return;

		// Baris kategori = baris yang akunnya sama dengan kategori transaksi (bukan "bukan akun bank saat ini",
		// agar tetap benar bila akun bank perusahaan pernah diganti).
		const moved = await tx
			.update(journalLines)
			.set({ accountId })
			.where(and(eq(journalLines.journalId, entry.id), eq(journalLines.accountId, txn.accountId)))
			.returning({ id: journalLines.id });
		if (moved.length !== 1) throw new ApiError(409, 'journal_not_editable', 'Struktur jurnal tidak dikenali');
		await tx
			.update(transactions)
			.set({ accountId, source: 'USER', confirmedBy: userId, confirmedAt: new Date() })
			.where(eq(transactions.id, txn.id));
	});
}
