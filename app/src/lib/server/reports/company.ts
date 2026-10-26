import { eq } from 'drizzle-orm';
import { db } from '../db';
import { companies } from '../db/schema';
import { notFound } from '../api';
import { getCompanyLogo } from '../company/logo';
import { getCompanyAsset } from '../company/assets';
import { toEmbeddablePng, toSafePdfImage } from './logo-for-pdf';

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

export interface InvoiceCompanyData {
	name: string;
	address: string | null;
	email: string | null;
	phone: string | null;
	bankName: string | null;
	bankAccountNo: string | null;
	bankAccountHolder: string | null;
	swiftCode: string | null;
	signerName: string | null;
	signerTitle: string | null;
	logoPng: Buffer | null;
	signaturePng: Buffer | null;
	watermarkPng: Buffer | null;
}

/** Data perusahaan untuk PDF invoice: kontak, info pembayaran, penanda tangan, dan gambar yang
 * sudah siap disisipkan `pdfkit` (gambar rusak menjadi `null`, bukan error). */
export async function getInvoiceCompanyData(companyId: string): Promise<InvoiceCompanyData> {
	const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
	if (!company) throw notFound('Perusahaan');
	const [logo, signature, watermark] = await Promise.all([
		getCompanyLogo(companyId),
		getCompanyAsset(companyId, 'signature'),
		getCompanyAsset(companyId, 'watermark')
	]);
	const [logoPng, signaturePng, watermarkPng] = await Promise.all(
		[logo, signature, watermark].map((a) => (a ? toSafePdfImage(a.content, a.mime) : null))
	);
	return {
		name: company.name,
		address: company.address,
		email: company.email,
		phone: company.phone,
		bankName: company.bankName,
		bankAccountNo: company.bankAccountNo,
		bankAccountHolder: company.bankAccountHolder,
		swiftCode: company.swiftCode,
		signerName: company.signerName,
		signerTitle: company.signerTitle,
		logoPng,
		signaturePng,
		watermarkPng
	};
}
