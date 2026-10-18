import { beforeEach, expect, test } from 'bun:test';
import PDFDocument from 'pdfkit';
import { PDFParse } from 'pdf-parse';
import { getCompanyLetterheadData, drawLetterhead } from '../../src/lib/server/reports/pdf-letterhead';
import { setCompanyLogo } from '../../src/lib/server/company/logo';
import { makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function renderToText(buildDoc: (doc: PDFKit.PDFDocument) => void): Promise<string> {
	const doc = new PDFDocument();
	const chunks: Buffer[] = [];
	doc.on('data', (c: Buffer) => chunks.push(c));
	const done = new Promise<void>((resolve) => doc.on('end', resolve));
	buildDoc(doc);
	doc.end();
	await done;
	const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
	return (await parser.getText()).text;
}

test('letterhead with no logo uploaded: null logoPng, name/title/period still render', async () => {
	const { companyId } = await makeCompany('PT Uji Coba');
	const company = await getCompanyLetterheadData(companyId);
	expect(company.logoPng).toBeNull();
	expect(company.name).toBe('PT Uji Coba');
	const text = await renderToText((doc) => drawLetterhead(doc, company, 'Neraca Saldo', 'Agustus 2026'));
	expect(text).toContain('PT Uji Coba');
	expect(text).toContain('Neraca Saldo');
	expect(text).toContain('Agustus 2026');
});

test('letterhead with an uploaded WebP logo: logoPng is a real PNG the doc can embed without throwing', async () => {
	const { companyId } = await makeCompany('PT Logo');
	const WEBP_1X1 = Buffer.from('UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64');
	await setCompanyLogo(companyId, WEBP_1X1);
	const company = await getCompanyLetterheadData(companyId);
	expect(company.logoPng).not.toBeNull();
	// Must not throw when pdfkit actually tries to embed it.
	await renderToText((doc) => drawLetterhead(doc, company, 'Neraca Saldo', 'Agustus 2026'));
});
