import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, categoryRules, transactions } from '../../src/lib/server/db/schema';
import { applyRulesToPending, upsertUserRule } from '../../src/lib/server/categorize/rules';
import { accountIdByCode, makeCompany, makeUpload } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const txn = (id: string) => db.query.transactions.findFirst({ where: eq(transactions.id, id) });

test('confirms matching transactions with correct direction only', async () => {
	const { companyId } = await makeCompany();
	const { uploadId, txnIds } = await makeUpload(companyId, null, [
		{ description: 'BIAYA ADM 0998', debit: '30000' },
		{ description: 'TRSF TOKOPEDIA SETTLEMENT', credit: '500000' },
		{ description: 'BELANJA TOKOPEDIA ATK', debit: '75000' },
		{ description: 'TRANSFER DARI PELANGGAN', credit: '1000000' }
	]);
	expect(await applyRulesToPending(db, companyId, uploadId)).toBe(2);

	const adm = await txn(txnIds[0]);
	expect(adm?.isConfirmed).toBe(true);
	expect(adm?.source).toBe('RULE');
	expect(adm?.aiConfidence).toBe('1.000');
	expect(adm?.accountId).toBe(await accountIdByCode(companyId, '5-2010'));
	expect((await txn(txnIds[1]))?.accountId).toBe(await accountIdByCode(companyId, '4-1002'));
	expect((await txn(txnIds[2]))?.isConfirmed).toBe(false); // TOKOPEDIA rule hanya untuk CR
	expect((await txn(txnIds[3]))?.isConfirmed).toBe(false);
});

test('rules pointing to inactive accounts are ignored', async () => {
	const { companyId } = await makeCompany();
	await db.update(accounts).set({ isActive: false }).where(eq(accounts.id, await accountIdByCode(companyId, '5-2010')));
	const { uploadId } = await makeUpload(companyId, null, [{ description: 'BIAYA ADM', debit: '30000' }]);
	expect(await applyRulesToPending(db, companyId, uploadId)).toBe(0);
});

test('upsertUserRule creates then overrides a USER rule', async () => {
	const { companyId } = await makeCompany();
	const gaji = await accountIdByCode(companyId, '5-2001');
	const sewa = await accountIdByCode(companyId, '5-2003');
	await upsertUserRule(db, companyId, 'PAYROLL', gaji, 'DB');
	await upsertUserRule(db, companyId, 'PAYROLL', sewa, 'DB');
	const rows = await db.select().from(categoryRules).where(eq(categoryRules.keywordPattern, 'PAYROLL'));
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({ accountId: sewa, source: 'USER', priority: 100, direction: 'DB' });
});
