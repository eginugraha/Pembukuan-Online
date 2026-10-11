import { and, asc, eq, sql } from 'drizzle-orm';
import { ApiError } from '../api';
import type { Executor } from '../db';
import { accounts } from '../db/schema';

export interface LeafAccount {
	id: string;
	code: string;
	name: string;
	type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
	normalBal: 'DEBIT' | 'CREDIT';
}

export interface AccountRow extends LeafAccount {
	parentId: string | null;
	cashFlowCat: 'OPERATING' | 'INVESTING' | 'FINANCING' | null;
	isActive: boolean;
	isLeaf: boolean;
}

const noChildren = sql`not exists (select 1 from accounts c where c.parent_id = ${accounts.id})`;

const leafColumns = {
	id: accounts.id,
	code: accounts.code,
	name: accounts.name,
	type: accounts.type,
	normalBal: accounts.normalBal
};

export async function listLeafAccounts(ex: Executor, companyId: string): Promise<LeafAccount[]> {
	return ex
		.select(leafColumns)
		.from(accounts)
		.where(and(eq(accounts.companyId, companyId), eq(accounts.isActive, true), noChildren))
		.orderBy(asc(accounts.code));
}

export async function assertLeafAccount(ex: Executor, companyId: string, accountId: string): Promise<LeafAccount> {
	const [row] = await ex
		.select(leafColumns)
		.from(accounts)
		.where(and(eq(accounts.id, accountId), eq(accounts.companyId, companyId), eq(accounts.isActive, true), noChildren))
		.limit(1);
	if (!row) throw new ApiError(422, 'invalid_account', 'Akun tidak valid, tidak aktif, atau bukan akun detail (leaf)');
	return row;
}

export async function listAccounts(ex: Executor, companyId: string): Promise<AccountRow[]> {
	return ex
		.select({
			...leafColumns,
			parentId: accounts.parentId,
			cashFlowCat: accounts.cashFlowCat,
			isActive: accounts.isActive,
			isLeaf: sql<boolean>`${noChildren}`
		})
		.from(accounts)
		.where(eq(accounts.companyId, companyId))
		.orderBy(asc(accounts.code));
}
