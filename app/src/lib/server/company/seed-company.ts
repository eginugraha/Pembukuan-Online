import { eq } from 'drizzle-orm';
import { db, type Executor } from '../db';
import { accounts, categoryRules, companies } from '../db/schema';
import { BANK_ACCOUNT_CODE, DEFAULT_COA } from './coa-data';
import { DEFAULT_RULES } from './rules-data';

/** Isi CoA PSAK default + rule SYSTEM + akun bank untuk satu perusahaan. Idempoten. */
export async function seedCompany(ex: Executor, companyId: string): Promise<void> {
	const existing = await ex
		.select({ id: accounts.id })
		.from(accounts)
		.where(eq(accounts.companyId, companyId))
		.limit(1);
	if (existing.length > 0) return;

	const idByCode = new Map<string, string>();
	for (const a of DEFAULT_COA) {
		const [row] = await ex
			.insert(accounts)
			.values({
				companyId,
				code: a.code,
				name: a.name,
				type: a.type,
				normalBal: a.normalBal,
				parentId: a.parent ? idByCode.get(a.parent)! : null
			})
			.returning({ id: accounts.id });
		idByCode.set(a.code, row.id);
	}

	await ex.insert(categoryRules).values(
		DEFAULT_RULES.map((r) => ({
			companyId,
			keywordPattern: r.keyword,
			accountId: idByCode.get(r.account)!,
			direction: r.direction,
			priority: 0,
			source: 'SYSTEM' as const
		}))
	);

	await ex
		.update(companies)
		.set({ bankAccountId: idByCode.get(BANK_ACCOUNT_CODE)! })
		.where(eq(companies.id, companyId));
}

export async function createCompany(input: {
	name: string;
	npwp?: string | null;
	address?: string | null;
}): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const [company] = await tx
			.insert(companies)
			.values({ name: input.name.trim(), npwp: input.npwp ?? null, address: input.address ?? null })
			.returning({ id: companies.id });
		await seedCompany(tx, company.id);
		return company;
	});
}
