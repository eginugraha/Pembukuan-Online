import { assertLeafAccount, type LeafAccount } from '../accounts/queries';
import { ApiError } from '../api';
import type { Executor } from '../db';

export type AccountType = LeafAccount['type'];

/** Akun leaf aktif milik perusahaan yang tipenya `type` -- satu tipe, atau salah satu dari daftar tipe. */
export async function assertAccountOfType(
	ex: Executor,
	companyId: string,
	accountId: string,
	type: AccountType | AccountType[]
): Promise<LeafAccount> {
	const row = await assertLeafAccount(ex, companyId, accountId);
	const allowed = Array.isArray(type) ? type : [type];
	if (!allowed.includes(row.type)) {
		throw new ApiError(422, 'wrong_account_type', `Akun ini harus bertipe ${allowed.join(' atau ')}`, undefined, { field: 'accountId' });
	}
	return row;
}
