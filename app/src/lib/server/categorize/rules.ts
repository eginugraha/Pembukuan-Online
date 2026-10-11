import { and, eq, inArray } from 'drizzle-orm';
import { D } from '../../money';
import type { Executor } from '../db';
import { accounts, categoryRules, transactions } from '../db/schema';

export type Direction = 'DB' | 'CR';

export interface RuleLike {
	id: string;
	keywordPattern: string;
	accountId: string;
	priority: number;
	source: 'SYSTEM' | 'USER';
	direction: Direction | null;
}

export function directionOf(t: { debit: string }): Direction {
	return D(t.debit).gt(0) ? 'DB' : 'CR';
}

export function normalizeKeyword(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const k = raw.trim().toUpperCase().replace(/\s+/g, ' ');
	return k.length >= 3 ? k : null;
}

const SOURCE_RANK = { USER: 1, SYSTEM: 0 } as const;

/** Negatif bila `a` lebih diutamakan dari `b`: USER > SYSTEM, priority tinggi, keyword lebih panjang. */
export function compareRules(a: RuleLike, b: RuleLike): number {
	return (
		SOURCE_RANK[b.source] - SOURCE_RANK[a.source] ||
		b.priority - a.priority ||
		b.keywordPattern.length - a.keywordPattern.length
	);
}

export function pickRule(rules: RuleLike[], description: string, direction: Direction): RuleLike | null {
	const text = description.toUpperCase();
	let best: RuleLike | null = null;
	for (const r of rules) {
		if (r.direction && r.direction !== direction) continue;
		if (!text.includes(r.keywordPattern.toUpperCase())) continue; // literal, bukan LIKE
		if (!best || compareRules(r, best) < 0) best = r;
	}
	return best;
}

export async function loadRules(ex: Executor, companyId: string): Promise<RuleLike[]> {
	return ex
		.select({
			id: categoryRules.id,
			keywordPattern: categoryRules.keywordPattern,
			accountId: categoryRules.accountId,
			priority: categoryRules.priority,
			source: categoryRules.source,
			direction: categoryRules.direction
		})
		.from(categoryRules)
		.innerJoin(accounts, eq(accounts.id, categoryRules.accountId))
		.where(and(eq(categoryRules.companyId, companyId), eq(accounts.isActive, true)));
}

/** Terapkan rule ke transaksi yang belum confirmed; yang cocok langsung confirmed (source RULE). */
export async function applyRulesToPending(ex: Executor, companyId: string, uploadId?: string): Promise<number> {
	const rules = await loadRules(ex, companyId);
	if (rules.length === 0) return 0;
	const conditions = [eq(transactions.companyId, companyId), eq(transactions.isConfirmed, false)];
	if (uploadId) conditions.push(eq(transactions.uploadId, uploadId));
	const pending = await ex
		.select({ id: transactions.id, description: transactions.description, debit: transactions.debit })
		.from(transactions)
		.where(and(...conditions));

	const idsByAccount = new Map<string, string[]>();
	for (const t of pending) {
		const rule = pickRule(rules, t.description, directionOf(t));
		if (!rule) continue;
		const ids = idsByAccount.get(rule.accountId) ?? [];
		ids.push(t.id);
		idsByAccount.set(rule.accountId, ids);
	}

	let count = 0;
	const now = new Date();
	for (const [accountId, ids] of idsByAccount) {
		await ex
			.update(transactions)
			.set({ accountId, source: 'RULE', aiConfidence: '1.000', isConfirmed: true, confirmedAt: now, confirmedBy: null })
			.where(inArray(transactions.id, ids));
		count += ids.length;
	}
	return count;
}

export async function upsertUserRule(
	ex: Executor,
	companyId: string,
	keyword: string,
	accountId: string,
	direction: Direction
): Promise<void> {
	await ex
		.insert(categoryRules)
		.values({ companyId, keywordPattern: keyword, accountId, direction, priority: 100, source: 'USER' })
		.onConflictDoUpdate({
			target: [categoryRules.companyId, categoryRules.keywordPattern, categoryRules.direction],
			set: { accountId, priority: 100, source: 'USER' }
		});
}
