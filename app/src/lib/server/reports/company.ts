import { eq } from 'drizzle-orm';
import { db } from '../db';
import { companies } from '../db/schema';
import { notFound } from '../api';

export async function getCompanyReportInfo(companyId: string): Promise<{ name: string; fiscalYear: string }> {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (!company) throw notFound('Perusahaan');
	return { name: company.name, fiscalYear: company.fiscalYear };
}
