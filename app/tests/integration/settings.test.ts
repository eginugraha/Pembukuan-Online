import { beforeEach, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, authAccount, categoryRules, companies, user, userCompanies } from '../../src/lib/server/db/schema';
import { deactivateAccount, updateAccount } from '../../src/lib/server/accounts/service';
import { updateCompany } from '../../src/lib/server/company/service';
import { createRule, deleteRule, listRules } from '../../src/lib/server/rules/service';
import { addMember, changeRole, listMembers, removeMember, setSuperAdmin } from '../../src/lib/server/users/service';
import { verifyPassword } from '../../src/lib/server/password';
import { PATCH as PATCH_COMPANY } from '../../src/routes/api/companies/[id]/+server';
import { POST as CREATE_COMPANY } from '../../src/routes/api/companies/+server';
import { accountIdByCode, addMember as addMemberRaw, contextFor, makeCompany, makeUser } from './factory';
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

test('updateCompany validates bank account is an active ASSET leaf of the company', async () => {
	const { companyId } = await makeCompany();
	const kas = await accountIdByCode(companyId, '1-1001');
	await updateCompany(companyId, { name: 'PT Baru', npwp: '01.234', address: 'Bandung', bankAccountId: kas });
	expect(await db.query.companies.findFirst({ where: eq(companies.id, companyId) })).toMatchObject({ name: 'PT Baru', bankAccountId: kas });
	expect(await codeOf(updateCompany(companyId, { name: 'X', bankAccountId: await accountIdByCode(companyId, '5-2010') }))).toBe('invalid_bank_account');
});

test('company API: admin edits only active company; only super admin creates', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const admin = await makeUser();
	await addMemberRaw(admin.id, a.companyId, 'admin');
	const ctx = await contextFor(admin);
	expect((await call(PATCH_COMPANY, fakeEvent({ ctx, method: 'PATCH', params: { id: a.companyId }, body: { name: 'PT A2' } }))).status).toBe(200);
	expect((await call(PATCH_COMPANY, fakeEvent({ ctx, method: 'PATCH', params: { id: b.companyId }, body: { name: 'X' } }))).status).toBe(404);
	expect((await call(CREATE_COMPANY, fakeEvent({ ctx, method: 'POST', body: { name: 'PT C' } }))).status).toBe(403);
	const su = await makeUser({ isSuperAdmin: true });
	const res = await call(CREATE_COMPANY, fakeEvent({ ctx: await contextFor(su), method: 'POST', body: { name: 'PT C' } }));
	expect(res.status).toBe(201);
	expect(await db.select().from(accounts).where(eq(accounts.companyId, res.body.id))).toHaveLength(76);
});

test('members: create new user, link existing user, change role, last-admin guard, remove', async () => {
	const { companyId } = await makeCompany();
	const other = await makeCompany('PT Lain');
	const created = await addMember(companyId, { email: 'Baru@Test.Local', name: 'Baru', password: 'password123', role: 'accountant' });
	expect(created.created).toBe(true);
	const u = await db.query.user.findFirst({ where: eq(user.email, 'baru@test.local') });
	expect(u).toBeDefined();

	const linked = await addMember(other.companyId, { email: 'baru@test.local', role: 'viewer' });
	expect(linked).toEqual({ userId: u!.id, created: false });
	expect(await codeOf(addMember(companyId, { email: 'baru@test.local', role: 'viewer' }))).toBe('already_member');
	expect(await codeOf(addMember(companyId, { email: 'tanpa@test.local', role: 'viewer' }))).toBe('password_required');

	const admin = await makeUser();
	await addMemberRaw(admin.id, companyId, 'admin');
	expect(await codeOf(changeRole(companyId, admin.id, 'viewer'))).toBe('last_admin');
	expect(await codeOf(removeMember(companyId, admin.id))).toBe('last_admin');
	await changeRole(companyId, u!.id, 'admin');
	await changeRole(companyId, admin.id, 'viewer');
	await removeMember(companyId, admin.id);
	expect((await listMembers(companyId)).map((m) => m.email)).toEqual(['baru@test.local']);
	expect(await codeOf(changeRole(companyId, admin.id, 'viewer'))).toBe('not_found');
});

test('setSuperAdmin cannot change self', async () => {
	const su = await makeUser({ isSuperAdmin: true });
	const u = await makeUser();
	await setSuperAdmin(su.id, u.id, true);
	expect((await db.query.user.findFirst({ where: eq(user.id, u.id) }))?.isSuperAdmin).toBe(true);
	expect(await codeOf(setSuperAdmin(su.id, su.id, false))).toBe('cannot_change_self');
});

test('accounts: update fields, duplicate code, deactivate except bank account', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const sewa = await accountIdByCode(companyId, '5-2003');
	await updateAccount(companyId, sewa, { name: 'Beban Sewa Kantor', cashFlowCat: 'OPERATING' });
	expect(await db.query.accounts.findFirst({ where: eq(accounts.id, sewa) })).toMatchObject({ name: 'Beban Sewa Kantor', cashFlowCat: 'OPERATING' });
	expect(await codeOf(updateAccount(companyId, sewa, { code: '5-2004' }))).toBe('duplicate_code');
	await deactivateAccount(companyId, sewa);
	expect((await db.query.accounts.findFirst({ where: eq(accounts.id, sewa) }))?.isActive).toBe(false);
	expect(await codeOf(deactivateAccount(companyId, bankAccountId))).toBe('bank_account');
});

test('rules: create USER rule, reject duplicates and non-leaf accounts, delete', async () => {
	const { companyId } = await makeCompany();
	const gaji = await accountIdByCode(companyId, '5-2001');
	const { id } = await createRule(companyId, { keyword: ' payroll ', accountId: gaji, direction: 'DB' });
	const rule = await db.query.categoryRules.findFirst({ where: eq(categoryRules.id, id) });
	expect(rule).toMatchObject({ keywordPattern: 'PAYROLL', source: 'USER', priority: 100, direction: 'DB' });
	expect(await codeOf(createRule(companyId, { keyword: 'PAYROLL', accountId: gaji, direction: 'DB' }))).toBe('duplicate_rule');
	expect(await codeOf(createRule(companyId, { keyword: 'GAJI', accountId: await accountIdByCode(companyId, '5-2000') }))).toBe('invalid_account');
	expect((await listRules(companyId)).some((r) => r.keywordPattern === 'PAYROLL' && r.accountCode === '5-2001')).toBe(true);
	await deleteRule(companyId, id);
	expect(await db.select().from(categoryRules).where(and(eq(categoryRules.companyId, companyId), eq(categoryRules.keywordPattern, 'PAYROLL')))).toHaveLength(0);
});

test('new member password is hashed and verifiable', async () => {
	const { companyId } = await makeCompany();
	await addMember(companyId, { email: 'p@test.local', name: 'P', password: 'rahasia123', role: 'viewer' });
	const u = await db.query.user.findFirst({ where: eq(user.email, 'p@test.local') });
	const [cred] = await db.select().from(authAccount).where(eq(authAccount.userId, u!.id));
	expect(await verifyPassword('rahasia123', cred.password!)).toBe(true);
	expect(await db.select().from(userCompanies).where(eq(userCompanies.userId, u!.id))).toHaveLength(1);
});
