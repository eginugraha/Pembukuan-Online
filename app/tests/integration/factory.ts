import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, companies, userCompanies } from '../../src/lib/server/db/schema';
import { createCompany } from '../../src/lib/server/company/seed-company';
import { createUserWithPassword } from '../../src/lib/server/users/create';

let seq = 0;

export async function makeCompany(name = 'PT Uji Coba'): Promise<{ companyId: string; bankAccountId: string }> {
	const { id } = await createCompany({ name });
	const company = await db.query.companies.findFirst({ where: eq(companies.id, id) });
	return { companyId: id, bankAccountId: company!.bankAccountId! };
}

export async function makeUser(opts: { email?: string; name?: string; isSuperAdmin?: boolean; password?: string } = {}) {
	seq += 1;
	return createUserWithPassword(db, {
		email: opts.email ?? `user${seq}@test.local`,
		name: opts.name ?? `User ${seq}`,
		password: opts.password ?? 'password123',
		isSuperAdmin: opts.isSuperAdmin ?? false
	});
}

export async function addMember(userId: string, companyId: string, role: 'admin' | 'accountant' | 'viewer') {
	await db.insert(userCompanies).values({ userId, companyId, role });
}

export async function accountIdByCode(companyId: string, code: string): Promise<string> {
	const row = await db.query.accounts.findFirst({
		where: and(eq(accounts.companyId, companyId), eq(accounts.code, code))
	});
	if (!row) throw new Error(`Akun ${code} tidak ada`);
	return row.id;
}
