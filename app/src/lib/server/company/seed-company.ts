import { eq } from 'drizzle-orm';
import { db, type Executor } from '../db';
import { accounts, categoryRules, companies } from '../db/schema';
import type { CoaTemplateId } from '../../coa-templates';
import { BANK_ACCOUNT_CODE } from './coa-data';
import { COA_TEMPLATE_DATA } from './templates';

/** Isi CoA PSAK dari template + rule SYSTEM + akun bank untuk satu perusahaan. Idempoten. */
export async function seedCompany(ex: Executor, companyId: string, template: CoaTemplateId = 'general'): Promise<void> {
	const { coa, rules } = COA_TEMPLATE_DATA[template];
	const existing = await ex
		.select({ id: accounts.id })
		.from(accounts)
		.where(eq(accounts.companyId, companyId))
		.limit(1);
	if (existing.length > 0) return;

	const idByCode = new Map<string, string>();
	for (const a of coa) {
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
		rules.map((r) => ({
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
	coaTemplate?: CoaTemplateId;
}): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const [company] = await tx
			.insert(companies)
			.values({ name: input.name.trim(), npwp: input.npwp ?? null, address: input.address ?? null })
			.returning({ id: companies.id });
		await seedCompany(tx, company.id, input.coaTemplate);
		return company;
	});
}
