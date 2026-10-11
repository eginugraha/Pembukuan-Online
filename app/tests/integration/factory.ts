import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { accounts, companies, userCompanies } from '../../src/lib/server/db/schema';
import { createCompany } from '../../src/lib/server/company/seed-company';
import { createUserWithPassword } from '../../src/lib/server/users/create';
import { resolveContext, type AppContext } from '../../src/lib/server/rbac';
import { statementUploads, transactions } from '../../src/lib/server/db/schema';
import { normalizeDescription } from '../../src/lib/server/categorize/normalize';

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

export async function contextFor(
	u: { id: string; email: string; name: string; isSuperAdmin: boolean },
	companyId?: string
): Promise<AppContext> {
	return resolveContext(
		{ id: u.id, email: u.email, name: u.name, isSuperAdmin: u.isSuperAdmin },
		companyId ?? null
	);
}

export async function makeUpload(
	companyId: string,
	userId: string | null,
	txns: Array<{ date?: string; description: string; debit?: string; credit?: string }>,
	opts: {
		accountNo?: string;
		periodStart?: string;
		periodEnd?: string;
		status?: 'processing' | 'review' | 'done' | 'error';
	} = {}
): Promise<{ uploadId: string; txnIds: string[] }> {
	const [u] = await db
		.insert(statementUploads)
		.values({
			companyId,
			uploadedBy: userId,
			filename: 'uji.pdf',
			accountNo: opts.accountNo ?? '1234567890',
			periodStart: opts.periodStart ?? '2026-08-01',
			periodEnd: opts.periodEnd ?? '2026-08-31',
			openingBalance: '0',
			closingBalance: '0',
			status: opts.status ?? 'processing'
		})
		.returning({ id: statementUploads.id });
	const txnIds: string[] = [];
	for (const [i, t] of txns.entries()) {
		const [row] = await db
			.insert(transactions)
			.values({
				uploadId: u.id,
				companyId,
				lineNo: i + 1,
				txnDate: t.date ?? '2026-08-15',
				description: t.description,
				groupKey: normalizeDescription(t.description),
				debit: t.debit ?? '0',
				credit: t.credit ?? '0'
			})
			.returning({ id: transactions.id });
		txnIds.push(row.id);
	}
	return { uploadId: u.id, txnIds };
}
