import { beforeEach, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, authAccount, categoryRules, companies, user, userCompanies } from '../../src/lib/server/db/schema';
import { createCompany, seedCompany } from '../../src/lib/server/company/seed-company';
import { COA_TEMPLATE_DATA } from '../../src/lib/server/company/templates';
import { verifyPassword } from '../../src/lib/server/password';
import { runSeed } from '../../seeds/index';
import { accountIdByCode, makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('createCompany seeds CoA, rules and bank account', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const accs = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
	const rules = await db.select().from(categoryRules).where(eq(categoryRules.companyId, companyId));
	expect(accs).toHaveLength(76);
	expect(rules).toHaveLength(19);
	expect(rules.every((r) => r.source === 'SYSTEM' && r.priority === 0 && r.direction !== null)).toBe(true);
	expect(bankAccountId).toBe(await accountIdByCode(companyId, '1-1002'));
	const kas = accs.find((a) => a.code === '1-1001')!;
	expect(kas.parentId).toBe(accs.find((a) => a.code === '1-1000')!.id);
});

test('createCompany with IT template seeds the IT CoA and its rules', async () => {
	const { id } = await createCompany({ name: 'PT Software', coaTemplate: 'it' });
	const accs = await db.select().from(accounts).where(eq(accounts.companyId, id));
	const rules = await db.select().from(categoryRules).where(eq(categoryRules.companyId, id));
	expect(accs).toHaveLength(COA_TEMPLATE_DATA.it.coa.length);
	expect(rules).toHaveLength(COA_TEMPLATE_DATA.it.rules.length);
	expect(accs.some((a) => a.name === 'Cloud, Hosting & Server')).toBe(true);
	const company = await db.query.companies.findFirst({ where: eq(companies.id, id) });
	expect(company!.bankAccountId).toBe(await accountIdByCode(id, '1-1002'));
});

test('seedCompany is idempotent', async () => {
	const { companyId } = await makeCompany();
	await seedCompany(db, companyId);
	const accs = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
	expect(accs).toHaveLength(76);
});

test('runSeed creates super admin + demo company once', async () => {
	process.env.SEED_ADMIN_EMAIL = 'Admin@Pembukuan.Local';
	process.env.SEED_ADMIN_PASSWORD = 'rahasia-sekali';
	const first = await runSeed();
	const second = await runSeed();
	expect(second).toEqual(first);
	const users = await db.select().from(user);
	expect(users).toHaveLength(1);
	expect(users[0].email).toBe('admin@pembukuan.local');
	expect(users[0].isSuperAdmin).toBe(true);
	const [cred] = await db.select().from(authAccount).where(eq(authAccount.userId, users[0].id));
	expect(cred.providerId).toBe('credential');
	expect(await verifyPassword('rahasia-sekali', cred.password!)).toBe(true);
	expect(await db.select().from(companies)).toHaveLength(1);
	const memberships = await db
		.select()
		.from(userCompanies)
		.where(and(eq(userCompanies.userId, first.adminId), eq(userCompanies.companyId, first.companyId)));
	expect(memberships[0].role).toBe('admin');
});

test('runSeed refuses short password', async () => {
	process.env.SEED_ADMIN_PASSWORD = 'short';
	await expect(runSeed()).rejects.toThrow('SEED_ADMIN_PASSWORD');
});
