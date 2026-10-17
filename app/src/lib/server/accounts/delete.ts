import { and, eq, sql } from 'drizzle-orm';
import { D, toMoney } from '../../money';
import { ApiError, notFound } from '../api';
import { assertPeriodOpen } from '../closing/lock';
import { db, type Executor } from '../db';
import { accounts, categoryRules, companies, journalEntries, journalLines, transactions } from '../db/schema';

export interface AccountUsage {
	journalLines: number;
	transactions: number;
	rules: number;
	children: number;
	isBankAccount: boolean;
}

async function loadAccount(ex: Executor, companyId: string, accountId: string) {
	const account = await ex.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.companyId, companyId)) });
	if (!account) throw notFound('Akun');
	return account;
}

async function usageOf(ex: Executor, companyId: string, accountId: string): Promise<AccountUsage> {
	const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
	const [lines, txns, rules, children, company] = await Promise.all([
		count(ex.select({ n: sql<number>`count(*)::int` }).from(journalLines).where(eq(journalLines.accountId, accountId))),
		count(
			ex
				.select({ n: sql<number>`count(*)::int` })
				.from(transactions)
				.where(sql`${transactions.accountId} = ${accountId} or ${transactions.aiSuggestedAccountId} = ${accountId}`)
		),
		count(ex.select({ n: sql<number>`count(*)::int` }).from(categoryRules).where(eq(categoryRules.accountId, accountId))),
		count(ex.select({ n: sql<number>`count(*)::int` }).from(accounts).where(eq(accounts.parentId, accountId))),
		ex.query.companies.findFirst({ where: eq(companies.id, companyId) })
	]);
	return { journalLines: lines, transactions: txns, rules, children, isBankAccount: company?.bankAccountId === accountId };
}

/** Penggunaan akun: dipakai untuk memutuskan apakah penghapusan butuh akun tujuan pemindahan data. */
export async function getAccountUsage(companyId: string, accountId: string): Promise<AccountUsage> {
	await loadAccount(db, companyId, accountId);
	return usageOf(db, companyId, accountId);
}

/**
 * Setelah pemindahan, satu jurnal bisa punya beberapa baris untuk akun tujuan (mis. saldo awal akun lama dan
 * akun tujuan). Gabungkan menjadi satu baris bersaldo bersih agar halaman Saldo Awal dan laporan tetap benar;
 * bila saling meniadakan (net 0) baris dihapus. Jurnal tetap seimbang karena total debit-kredit tidak berubah.
 */
async function mergeDuplicateLines(tx: Executor, accountId: string): Promise<void> {
	const dupes = await tx
		.select({ journalId: journalLines.journalId, net: sql<string>`sum(${journalLines.debit} - ${journalLines.credit})` })
		.from(journalLines)
		.where(eq(journalLines.accountId, accountId))
		.groupBy(journalLines.journalId)
		.having(sql`count(*) > 1`);
	for (const d of dupes) {
		await tx.delete(journalLines).where(and(eq(journalLines.journalId, d.journalId), eq(journalLines.accountId, accountId)));
		const net = D(d.net);
		if (!net.isZero()) {
			await tx.insert(journalLines).values({
				journalId: d.journalId,
				accountId,
				debit: toMoney(net.gt(0) ? net : 0),
				credit: toMoney(net.lt(0) ? net.neg() : 0)
			});
		}
	}
}

const moveError = (message: string) => new ApiError(422, 'invalid_move_target', message, undefined, { field: 'moveToId' });

/**
 * Hapus akun permanen. Akun yang sudah dipakai (jurnal, transaksi, saran AI, rule) hanya bisa dihapus bila
 * `moveToId` diberikan: semua referensi dipindahkan ke akun itu dan akun dihapus dalam SATU transaksi
 * (gagal sebagian = tidak ada yang berubah). Akun tujuan harus bertipe dan bersaldo normal sama agar
 * laporan keuangan tidak terbalik.
 */
export async function deleteAccount(companyId: string, accountId: string, moveToId?: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);
		const account = await loadAccount(tx, companyId, accountId);
		const usage = await usageOf(tx, companyId, accountId);
		if (usage.isBankAccount) {
			throw new ApiError(409, 'bank_account', 'Akun ini dipakai sebagai akun bank perusahaan; ganti dulu di Pengaturan → Perusahaan');
		}
		if (usage.children > 0) {
			throw new ApiError(409, 'has_children', 'Akun ini punya akun anak; hapus atau pindahkan akun anaknya terlebih dahulu');
		}

		if (usage.journalLines + usage.transactions + usage.rules > 0) {
			if (!moveToId) {
				throw new ApiError(409, 'move_required', 'Akun sudah dipakai; pilih akun tujuan untuk memindahkan datanya', undefined, { field: 'moveToId' });
			}
			if (moveToId === accountId) throw moveError('Akun tujuan tidak boleh akun yang sama');
			const target = await tx.query.accounts.findFirst({ where: and(eq(accounts.id, moveToId), eq(accounts.companyId, companyId)) });
			if (!target) throw moveError('Akun tujuan tidak ditemukan');
			const targetUsage = await usageOf(tx, companyId, target.id);
			if (!target.isActive) throw moveError('Akun tujuan harus aktif');
			if (targetUsage.children > 0) throw moveError('Akun tujuan harus akun detail (bukan induk)');
			if (targetUsage.isBankAccount) throw moveError('Akun bank perusahaan tidak bisa menjadi tujuan pemindahan');
			if (target.type !== account.type) throw moveError('Akun tujuan harus bertipe sama');
			if (target.normalBal !== account.normalBal) throw moveError('Akun tujuan harus bersaldo normal sama');

			const dated = await tx
				.selectDistinct({ d: journalEntries.entryDate })
				.from(journalLines)
				.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
				.where(eq(journalLines.accountId, accountId));
			await assertPeriodOpen(tx, companyId, dated.map((r) => r.d));

			await tx.update(journalLines).set({ accountId: target.id }).where(eq(journalLines.accountId, accountId));
			await mergeDuplicateLines(tx, target.id);
			await tx.update(transactions).set({ accountId: target.id }).where(eq(transactions.accountId, accountId));
			await tx.update(transactions).set({ aiSuggestedAccountId: target.id }).where(eq(transactions.aiSuggestedAccountId, accountId));
			await tx.update(categoryRules).set({ accountId: target.id }).where(eq(categoryRules.accountId, accountId));
		}
		await tx.delete(accounts).where(eq(accounts.id, accountId));
	});
}
