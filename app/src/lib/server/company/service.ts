import { and, eq } from 'drizzle-orm';
import { COA_TEMPLATE_IDS } from '../../coa-templates';
import { assertLeafAccount } from '../accounts/queries';
import { ApiError, notFound } from '../api';
import { db } from '../db';
import { companies, journalEntries } from '../db/schema';

import { CreateCompanyInput, DeleteCompanyInput, UpdateCompanyInput } from '../../schemas/company';

export { CreateCompanyInput, DeleteCompanyInput, UpdateCompanyInput };

export async function getCompany(companyId: string) {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (!company) throw notFound('Perusahaan');
	return company;
}

const OPTIONAL_COMPANY_FIELDS = [
	'code',
	'email',
	'phone',
	'bankName',
	'bankAccountNo',
	'bankAccountHolder',
	'swiftCode'
] as const;

function optionalFields(input: UpdateCompanyInput) {
	const out: Partial<Record<(typeof OPTIONAL_COMPANY_FIELDS)[number], string | null>> = {};
	for (const k of OPTIONAL_COMPANY_FIELDS) {
		if (input[k] !== undefined) out[k] = input[k] || null;
	}
	return out;
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
				...(input.bankAccountId !== undefined ? { bankAccountId: input.bankAccountId } : {}),
				// Field baru hanya ditulis bila dikirim, supaya pemanggil lama tidak menghapusnya; string kosong menjadi null.
				...optionalFields(input)
			})
			.where(and(eq(companies.id, companyId)))
			.returning({ id: companies.id });
		if (updated.length === 0) throw notFound('Perusahaan');
	});
}

/** Hapus perusahaan beserta seluruh datanya: jurnal dihapus lebih dulu, sisanya lewat cascade dari baris perusahaan. */
export async function deleteCompany(companyId: string, confirmName: string): Promise<void> {
	const company = await getCompany(companyId);
	if (confirmName.trim() !== company.name) {
		throw new ApiError(422, 'confirm_mismatch', 'Nama perusahaan tidak cocok', undefined, { field: 'confirmName' });
	}
	await db.transaction(async (tx) => {
		// FK journal_lines_account_id_accounts_id_fk (journal_lines.account_id -> accounts) tanpa ON DELETE
		// memblokir cascade akun; hapus jurnal (dan barisnya) lebih dulu.
		await tx.delete(journalEntries).where(eq(journalEntries.companyId, companyId));
		await tx.delete(companies).where(eq(companies.id, companyId));
	});
}
