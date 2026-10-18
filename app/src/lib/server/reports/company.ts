import { eq } from 'drizzle-orm';
import { db } from '../db';
import { companies } from '../db/schema';
import { notFound } from '../api';
import { getCompanyLogo } from '../company/logo';
import { toEmbeddablePng } from './logo-for-pdf';

export async function getCompanyReportInfo(companyId: string): Promise<{ name: string; fiscalYear: string }> {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (!company) throw notFound('Perusahaan');
	return { name: company.name, fiscalYear: company.fiscalYear };
}

export interface LetterheadData {
	name: string;
	npwp: string | null;
	address: string | null;
	logoPng: Buffer | null;
}

export async function getCompanyLetterheadData(companyId: string): Promise<LetterheadData> {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (!company) throw notFound('Perusahaan');
	const logo = await getCompanyLogo(companyId);
	const logoPng = logo ? await toEmbeddablePng(logo.content, logo.mime) : null;
	return { name: company.name, npwp: company.npwp, address: company.address, logoPng };
}
