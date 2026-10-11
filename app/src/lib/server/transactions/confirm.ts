import { and, eq, gte, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { assertCategoryAccount, listLeafAccounts } from '../accounts/queries';
import { ApiError, notFound } from '../api';
import { applyRulesToPending, directionOf, normalizeKeyword, upsertUserRule } from '../categorize/rules';
import { db } from '../db';
import { companies, journalEntries, statementUploads, transactions } from '../db/schema';
import { refreshReviewedUploads } from '../uploads/status';

export const ConfirmInput = z.object({
	accountId: z.uuid(),
	rule: z.object({ keyword: z.string() }).nullable().optional()
});
export type ConfirmInput = z.infer<typeof ConfirmInput>;

export const BulkConfirmInput = z.object({
	uploadId: z.uuid(),
	minConfidence: z.number().min(0).max(1).default(0.8)
});
export type BulkConfirmInput = z.input<typeof BulkConfirmInput>;

export async function confirmTransaction(
	companyId: string,
	userId: string,
	txnId: string,
	input: ConfirmInput
): Promise<{ propagated: number }> {
	return db.transaction(async (tx) => {
		const [t] = await tx
			.select({
				id: transactions.id,
				debit: transactions.debit,
				aiSuggestedAccountId: transactions.aiSuggestedAccountId,
				journalId: journalEntries.id
			})
			.from(transactions)
			.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
			.where(and(eq(transactions.id, txnId), eq(transactions.companyId, companyId)))
			.limit(1);
		if (!t) throw notFound('Transaksi');
		if (t.journalId) {
			throw new ApiError(409, 'transaction_journaled', 'Transaksi sudah dijurnal sehingga kategorinya tidak bisa diubah');
		}
		await assertCategoryAccount(tx, companyId, input.accountId);

		let keyword: string | null = null;
		if (input.rule) {
			keyword = normalizeKeyword(input.rule.keyword);
			if (!keyword) throw new ApiError(422, 'invalid_keyword', 'Keyword rule minimal 3 karakter');
		}

		await tx
			.update(transactions)
			.set({
				accountId: input.accountId,
				isConfirmed: true,
				confirmedBy: userId,
				confirmedAt: new Date(),
				source: input.accountId === t.aiSuggestedAccountId ? 'AI' : 'USER'
			})
			.where(eq(transactions.id, t.id));

		let propagated = 0;
		if (keyword) {
			await upsertUserRule(tx, companyId, keyword, input.accountId, directionOf(t));
			propagated = await applyRulesToPending(tx, companyId);
		}
		await refreshReviewedUploads(tx, companyId);
		return { propagated };
	});
}

export async function bulkConfirm(
	companyId: string,
	userId: string,
	input: BulkConfirmInput
): Promise<{ confirmed: number; propagated: number }> {
	const { uploadId, minConfidence } = BulkConfirmInput.parse(input);
	return db.transaction(async (tx) => {
		const upload = await tx.query.statementUploads.findFirst({
			where: and(eq(statementUploads.id, uploadId), eq(statementUploads.companyId, companyId))
		});
		if (!upload) throw notFound('Upload');

		const company = await tx.query.companies.findFirst({ where: eq(companies.id, companyId) });
		const leaf = new Set(
			(await listLeafAccounts(tx, companyId)).filter((a) => a.id !== company?.bankAccountId).map((a) => a.id)
		);
		const rows = (
			await tx
				.select({
					id: transactions.id,
					debit: transactions.debit,
					accountId: transactions.aiSuggestedAccountId,
					keyword: transactions.aiKeyword,
					description: transactions.description
				})
				.from(transactions)
				.where(
					and(
						eq(transactions.uploadId, uploadId),
						eq(transactions.isConfirmed, false),
						isNotNull(transactions.aiSuggestedAccountId),
						gte(transactions.aiConfidence, minConfidence.toFixed(3))
					)
				)
		).filter((r) => r.accountId && leaf.has(r.accountId));

		const now = new Date();
		for (const r of rows) {
			await tx
				.update(transactions)
				.set({ accountId: r.accountId, isConfirmed: true, confirmedBy: userId, confirmedAt: now, source: 'AI' })
				.where(eq(transactions.id, r.id));
		}

		const learned = new Set<string>();
		for (const r of rows) {
			const keyword = normalizeKeyword(r.keyword);
			// Keyword AI tidak dilihat user saat bulk confirm: hanya pelajari yang benar-benar ada di keterangan.
			if (!keyword || !r.description.toUpperCase().includes(keyword)) continue;
			const direction = directionOf(r);
			const key = `${keyword}|${direction}`;
			if (learned.has(key)) continue;
			learned.add(key);
			await upsertUserRule(tx, companyId, keyword, r.accountId!, direction);
		}

		const propagated = learned.size > 0 ? await applyRulesToPending(tx, companyId) : 0;
		await refreshReviewedUploads(tx, companyId);
		return { confirmed: rows.length, propagated };
	});
}
