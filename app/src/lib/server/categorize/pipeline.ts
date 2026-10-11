import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { listLeafAccounts } from '../accounts/queries';
import { db } from '../db';
import { companies, statementUploads, transactions } from '../db/schema';
import { settleUploadStatus } from '../uploads/status';
import { OllamaUnavailableError, type AiAccount, type AiGroup, type BatchResult } from './ollama';
import { applyRulesToPending, directionOf } from './rules';

export type SuggestFn = (groups: AiGroup[], accounts: AiAccount[]) => Promise<BatchResult>;

const BATCH_SIZE = 10;

export async function runCategorization(uploadId: string, suggest: SuggestFn): Promise<void> {
	const upload = await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, uploadId) });
	if (!upload) return;
	const companyId = upload.companyId;

	// Lapis 1: rule
	await applyRulesToPending(db, companyId, uploadId);

	// Lapis 2: AI untuk yang belum confirmed dan belum punya saran
	const pending = await db
		.select({
			id: transactions.id,
			description: transactions.description,
			groupKey: transactions.groupKey,
			debit: transactions.debit,
			credit: transactions.credit
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.uploadId, uploadId),
				eq(transactions.isConfirmed, false),
				isNull(transactions.aiSuggestedAccountId)
			)
		)
		.orderBy(asc(transactions.lineNo));

	let aiStatus: 'ok' | 'partial' | 'unavailable' = 'ok';
	if (pending.length > 0) {
		const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
		const leaf = (await listLeafAccounts(db, companyId)).filter((a) => a.id !== company?.bankAccountId);
		const idByCode = new Map(leaf.map((a) => [a.code, a.id]));
		const aiAccounts: AiAccount[] = leaf.map((a) => ({ code: a.code, name: a.name, type: a.type }));

		const byKey = new Map<string, typeof pending>();
		for (const t of pending) {
			const key = `${directionOf(t)}|${t.groupKey || t.description.toUpperCase()}`;
			byKey.set(key, [...(byKey.get(key) ?? []), t]);
		}
		const members = new Map<string, string[]>();
		const groups: AiGroup[] = [...byKey.values()].map((list, i) => {
			const groupId = String(i + 1);
			const first = list[0];
			const direction = directionOf(first);
			members.set(groupId, list.map((t) => t.id));
			return { groupId, sample: first.description, direction, amount: direction === 'DB' ? first.debit : first.credit };
		});

		let succeeded = 0;
		let failed = 0;
		for (let i = 0; i < groups.length; i += BATCH_SIZE) {
			let result: BatchResult;
			try {
				result = await suggest(groups.slice(i, i + BATCH_SIZE), aiAccounts);
			} catch (e) {
				if (e instanceof OllamaUnavailableError) {
					aiStatus = succeeded > 0 ? 'partial' : 'unavailable';
					break;
				}
				throw e;
			}
			if (result.ok) succeeded++;
			else failed++;
			for (const s of result.suggestions) {
				const accountId = idByCode.get(s.accountCode);
				const ids = members.get(s.groupId);
				if (!accountId || !ids) continue;
				await db
					.update(transactions)
					.set({
						aiSuggestedAccountId: accountId,
						aiConfidence: s.confidence.toFixed(3),
						aiReason: s.reason,
						aiKeyword: s.keyword,
						source: 'AI'
					})
					.where(inArray(transactions.id, ids));
			}
		}
		if (aiStatus === 'ok' && failed > 0) aiStatus = 'partial';
	}

	await db.update(statementUploads).set({ aiStatus, errorMessage: null }).where(eq(statementUploads.id, uploadId));
	await settleUploadStatus(db, uploadId);
}
