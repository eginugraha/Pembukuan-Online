import { assertLeafAccount, type LeafAccount } from '../accounts/queries';
import { ApiError } from '../api';
import type { Executor } from '../db';

export async function assertAccountOfType(
	ex: Executor,
	companyId: string,
	accountId: string,
	type: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE'
): Promise<LeafAccount> {
	const row = await assertLeafAccount(ex, companyId, accountId);
	if (row.type !== type) {
		throw new ApiError(422, 'wrong_account_type', `Akun ini harus bertipe ${type}`, undefined, { field: 'accountId' });
	}
	return row;
}
