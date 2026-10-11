import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts } from '../../src/lib/server/db/schema';
import { createAccount } from '../../src/lib/server/accounts/service';
import { GET, POST } from '../../src/routes/api/accounts/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('accountant creates leaf inheriting type and normal balance from parent', async () => {
	const { companyId } = await makeCompany();
	const parentId = await accountIdByCode(companyId, '5-2000');
	const { id } = await createAccount(companyId, 'accountant', { code: '5-2014', name: 'Beban Langganan Software', parentId, normalBal: 'CREDIT' });
	const row = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
	expect(row).toMatchObject({ type: 'EXPENSE', normalBal: 'DEBIT', parentId }); // override normalBal hanya untuk admin
});

test('admin may override normal balance', async () => {
	const { companyId } = await makeCompany();
	const parentId = await accountIdByCode(companyId, '1-2200');
	const { id } = await createAccount(companyId, 'admin', { code: '1-2205', name: 'Akum. Penyusutan Lain', parentId, normalBal: 'CREDIT' });
	expect((await db.query.accounts.findFirst({ where: eq(accounts.id, id) }))?.normalBal).toBe('CREDIT');
});

test('rejects duplicate code, used parent and foreign parent', async () => {
	const { companyId } = await makeCompany();
	const other = await makeCompany('PT Lain');
	const parentId = await accountIdByCode(companyId, '5-2000');
	expect(await codeOf(createAccount(companyId, 'accountant', { code: '5-2001', name: 'X', parentId }))).toBe('duplicate_code');
	const leaf = await accountIdByCode(companyId, '5-2010'); // dipakai rule seed "BIAYA ADM"
	expect(await codeOf(createAccount(companyId, 'accountant', { code: '5-2010-1', name: 'Sub', parentId: leaf }))).toBe('parent_in_use');
	expect(await codeOf(createAccount(companyId, 'accountant', { code: '9-0001', name: 'X', parentId: await accountIdByCode(other.companyId, '5-2000') }))).toBe('invalid_parent');
});

test('API: list leaf accounts for viewer, create requires accountant', async () => {
	const { companyId } = await makeCompany();
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const res = await call(GET, fakeEvent({ ctx: await contextFor(viewer), path: '/api/accounts?leaf=1' }));
	expect(res.status).toBe(200);
	expect(res.body.accounts.some((a: { code: string }) => a.code === '5-2000')).toBe(false);
	const body = { code: '5-2099', name: 'Baru', parentId: await accountIdByCode(companyId, '5-2000') };
	expect((await call(POST, fakeEvent({ ctx: await contextFor(viewer), method: 'POST', body }))).status).toBe(403);
});
