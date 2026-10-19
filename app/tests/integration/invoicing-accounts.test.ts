import { beforeEach, expect, test } from 'bun:test';
import { db } from '../../src/lib/server/db';
import { assertAccountOfType } from '../../src/lib/server/invoicing/accounts';
import { makeCompany, accountIdByCode } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const codeOf = async (p: Promise<unknown>) => {
	try { await p; } catch (e) { return (e as { code: string }).code; }
	return null;
};

test('accepts an account whose type matches', async () => {
	const { companyId } = await makeCompany();
	const id = await accountIdByCode(companyId, '4-1001');
	const row = await assertAccountOfType(db, companyId, id, 'REVENUE');
	expect(row.id).toBe(id);
});

test('rejects an account whose type does not match, with a clear message', async () => {
	const { companyId } = await makeCompany();
	const expenseAccount = await accountIdByCode(companyId, '5-2010');
	expect(await codeOf(assertAccountOfType(db, companyId, expenseAccount, 'REVENUE'))).toBe('wrong_account_type');
});
