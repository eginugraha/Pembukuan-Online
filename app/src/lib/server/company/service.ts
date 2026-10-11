import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertLeafAccount } from '../accounts/queries';
import { ApiError, notFound } from '../api';
import { db } from '../db';
import { companies } from '../db/schema';

export const CreateCompanyInput = z.object({
	name: z.string().trim().min(1).max(200),
	npwp: z.string().trim().max(20).nullable().optional(),
	address: z.string().trim().max(500).nullable().optional()
});

export const UpdateCompanyInput = CreateCompanyInput.extend({ bankAccountId: z.uuid().nullable().optional() });
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInput>;

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
				throw new ApiError(422, 'invalid_bank_account', 'Akun bank harus akun aset detail (leaf) yang aktif');
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
