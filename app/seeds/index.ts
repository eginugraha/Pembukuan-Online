import { eq } from 'drizzle-orm';
import { client, db } from '../src/lib/server/db';
import { companies, userCompanies } from '../src/lib/server/db/schema';
import { createCompany } from '../src/lib/server/company/seed-company';
import { createUserWithPassword, findUserByEmail } from '../src/lib/server/users/create';

const DEMO_COMPANY = 'PT Demo Perusahaan';

export async function runSeed(): Promise<{ adminId: string; companyId: string }> {
	const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@pembukuan.local';
	const password = process.env.SEED_ADMIN_PASSWORD;
	if (!password || password.length < 8) {
		throw new Error('SEED_ADMIN_PASSWORD wajib diisi (minimal 8 karakter)');
	}

	const admin =
		(await findUserByEmail(db, email)) ??
		(await createUserWithPassword(db, { email, name: 'Super Admin', password, isSuperAdmin: true }));

	const demo = await db.query.companies.findFirst({ where: eq(companies.name, DEMO_COMPANY) });
	const companyId = demo?.id ?? (await createCompany({ name: DEMO_COMPANY, npwp: '00.000.000.0-000.000' })).id;

	await db.insert(userCompanies).values({ userId: admin.id, companyId, role: 'admin' }).onConflictDoNothing();
	return { adminId: admin.id, companyId };
}

if (import.meta.main) {
	runSeed()
		.then(({ companyId }) => {
			console.log(`Seed selesai. Perusahaan demo: ${companyId}`);
			return client.end();
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
