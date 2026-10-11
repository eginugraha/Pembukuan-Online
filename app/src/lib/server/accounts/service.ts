import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Role } from '../../roles';
import { ApiError } from '../api';
import { db, type Executor } from '../db';
import { isUniqueViolation } from '../db/errors';
import { accounts, categoryRules, companies, journalLines, transactions } from '../db/schema';

export const CreateAccountInput = z.object({
	code: z.string().trim().min(1).max(20),
	name: z.string().trim().min(1).max(200),
	parentId: z.uuid(),
	normalBal: z.enum(['DEBIT', 'CREDIT']).optional(),
	cashFlowCat: z.enum(['OPERATING', 'INVESTING', 'FINANCING']).nullable().optional()
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

/** Akun dianggap terpakai bila direferensikan jurnal, transaksi, rule, atau sebagai akun bank perusahaan. */
export async function accountInUse(ex: Executor, accountId: string): Promise<boolean> {
	const [row] = await ex.execute<{ used: boolean }>(sql`
		select (
			exists (select 1 from ${journalLines} where ${journalLines.accountId} = ${accountId})
			or exists (select 1 from ${transactions} where ${transactions.accountId} = ${accountId} or ${transactions.aiSuggestedAccountId} = ${accountId})
			or exists (select 1 from ${categoryRules} where ${categoryRules.accountId} = ${accountId})
			or exists (select 1 from ${companies} where ${companies.bankAccountId} = ${accountId})
		) as used
	`);
	return Boolean(row?.used);
}

export async function createAccount(companyId: string, role: Role, input: CreateAccountInput): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const parent = await tx.query.accounts.findFirst({
			where: and(eq(accounts.id, input.parentId), eq(accounts.companyId, companyId))
		});
		if (!parent || !parent.isActive) throw new ApiError(422, 'invalid_parent', 'Akun induk tidak valid');
		if (await accountInUse(tx, parent.id)) {
			throw new ApiError(409, 'parent_in_use', 'Akun induk sudah dipakai transaksi/jurnal/rule; pilih akun induk lain');
		}
		const isAdmin = role === 'admin';
		try {
			const [row] = await tx
				.insert(accounts)
				.values({
					companyId,
					code: input.code,
					name: input.name,
					type: parent.type,
					normalBal: isAdmin && input.normalBal ? input.normalBal : parent.normalBal,
					parentId: parent.id,
					cashFlowCat: isAdmin ? (input.cashFlowCat ?? null) : null
				})
				.returning({ id: accounts.id });
			return row;
		} catch (e) {
			if (isUniqueViolation(e)) throw new ApiError(409, 'duplicate_code', `Kode akun ${input.code} sudah dipakai`);
			throw e;
		}
	});
}

export const UpdateAccountInput = z.object({
	code: z.string().trim().min(1).max(20).optional(),
	name: z.string().trim().min(1).max(200).optional(),
	normalBal: z.enum(['DEBIT', 'CREDIT']).optional(),
	cashFlowCat: z.enum(['OPERATING', 'INVESTING', 'FINANCING']).nullable().optional(),
	isActive: z.boolean().optional()
});
export type UpdateAccountInput = z.infer<typeof UpdateAccountInput>;

export async function updateAccount(companyId: string, accountId: string, input: UpdateAccountInput): Promise<void> {
	try {
		const updated = await db
			.update(accounts)
			.set(input)
			.where(and(eq(accounts.id, accountId), eq(accounts.companyId, companyId)))
			.returning({ id: accounts.id });
		if (updated.length === 0) throw new ApiError(404, 'not_found', 'Akun tidak ditemukan');
	} catch (e) {
		if (isUniqueViolation(e)) throw new ApiError(409, 'duplicate_code', `Kode akun ${input.code} sudah dipakai`);
		throw e;
	}
}

export async function deactivateAccount(companyId: string, accountId: string): Promise<void> {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (company?.bankAccountId === accountId) {
		throw new ApiError(409, 'bank_account', 'Akun ini dipakai sebagai akun bank perusahaan; ganti dulu di Pengaturan → Perusahaan');
	}
	await updateAccount(companyId, accountId, { isActive: false });
}
