import { and, asc, desc, eq } from 'drizzle-orm';
import { assertCategoryAccount } from '../accounts/queries';
import { ApiError, notFound } from '../api';
import { normalizeKeyword } from '../categorize/rules';
import { db } from '../db';
import { isUniqueViolation } from '../db/errors';
import { accounts, categoryRules } from '../db/schema';

import { CreateRuleInput } from '../../schemas/rule';

export { CreateRuleInput };

export async function listRules(companyId: string) {
	return db
		.select({
			id: categoryRules.id,
			keywordPattern: categoryRules.keywordPattern,
			direction: categoryRules.direction,
			priority: categoryRules.priority,
			source: categoryRules.source,
			accountId: categoryRules.accountId,
			accountCode: accounts.code,
			accountName: accounts.name,
			accountActive: accounts.isActive
		})
		.from(categoryRules)
		.innerJoin(accounts, eq(accounts.id, categoryRules.accountId))
		.where(eq(categoryRules.companyId, companyId))
		.orderBy(desc(categoryRules.source), desc(categoryRules.priority), asc(categoryRules.keywordPattern));
}

export async function createRule(companyId: string, input: CreateRuleInput): Promise<{ id: string }> {
	const keyword = normalizeKeyword(input.keyword);
	if (!keyword) throw new ApiError(422, 'invalid_keyword', 'Keyword rule minimal 3 karakter', undefined, { field: 'keyword' });
	await assertCategoryAccount(db, companyId, input.accountId);
	try {
		const [row] = await db
			.insert(categoryRules)
			.values({
				companyId,
				keywordPattern: keyword,
				accountId: input.accountId,
				direction: input.direction ?? null,
				priority: input.priority ?? 100,
				source: 'USER'
			})
			.returning({ id: categoryRules.id });
		return row;
	} catch (e) {
		if (isUniqueViolation(e)) throw new ApiError(409, 'duplicate_rule', `Rule dengan keyword "${keyword}" dan arah yang sama sudah ada`, undefined, { field: 'keyword' });
		throw e;
	}
}

export async function deleteRule(companyId: string, ruleId: string): Promise<void> {
	const deleted = await db
		.delete(categoryRules)
		.where(and(eq(categoryRules.id, ruleId), eq(categoryRules.companyId, companyId)))
		.returning({ id: categoryRules.id });
	if (deleted.length === 0) throw notFound('Rule');
}
