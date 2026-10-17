import { and, eq } from 'drizzle-orm';
import { COA_TEMPLATE_IDS } from '../../coa-templates';
import { assertLeafAccount } from '../accounts/queries';
import { ApiError, notFound } from '../api';
import { db } from '../db';
import { companies } from '../db/schema';

import { CreateCompanyInput, UpdateCompanyInput } from '../../schemas/company';

export { CreateCompanyInput, UpdateCompanyInput };

export async function getCompany(companyId: string) {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (!company) throw notFound('Perusahaan');
	return company;
}

export async function updateCompany(companyId: string, input: UpdateCompanyInput): Promise<void> {
	await db.transaction(async (tx) => {
		if (input.bankAccountId) {
			let account;
			try {
				account = await assertLeafAccount(tx, companyId, input.bankAccountId);
			} catch {
				account = null;
			}
			if (!account || account.type !== 'ASSET') {
				throw new ApiError(422, 'invalid_bank_account', 'Akun bank harus akun aset detail (leaf) yang aktif', undefined, { field: 'bankAccountId' });
			}
		}
		const updated = await tx
			.update(companies)
			.set({
				name: input.name,
				npwp: input.npwp ?? null,
				address: input.address ?? null,
				...(input.bankAccountId !== undefined ? { bankAccountId: input.bankAccountId } : {})
			})
			.where(and(eq(companies.id, companyId)))
			.returning({ id: companies.id });
		if (updated.length === 0) throw notFound('Perusahaan');
	});
}
