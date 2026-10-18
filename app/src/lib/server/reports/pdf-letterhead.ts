export { getCompanyLetterheadData, type LetterheadData } from './company';
import type { LetterheadData } from './company';

const LEFT_X = 50;
const RIGHT_X = 545;
const TOP_Y = 45;
const LOGO_SIZE = 40;

/**
 * Menggambar kop surat (logo, nama, alamat, NPWP perusahaan + judul & periode laporan) di
 * bagian atas dokumen PDF. Mengembalikan koordinat Y tepat di bawah garis pemisah, tempat
 * pemanggil mulai menggambar tabel laporannya.
 */
export function drawLetterhead(
	doc: PDFKit.PDFDocument,
	company: LetterheadData,
	reportTitle: string,
	periodLabel: string
): number {
	const textX = company.logoPng ? 100 : LEFT_X;

	if (company.logoPng) {
		doc.image(company.logoPng, LEFT_X, TOP_Y, { width: LOGO_SIZE, height: LOGO_SIZE });
	}

	doc.font('Helvetica-Bold').fontSize(12).text(company.name, textX, TOP_Y);
	doc.font('Helvetica').fontSize(9);
	if (company.address) doc.text(company.address, textX);
	if (company.npwp) doc.text(`NPWP: ${company.npwp}`, textX);

	const afterHeader = Math.max(doc.y, TOP_Y + LOGO_SIZE);

	doc.font('Helvetica-Bold').fontSize(14).text(reportTitle, LEFT_X, afterHeader + 10);
	doc.font('Helvetica').fontSize(10).text(periodLabel, LEFT_X);

	const ruleY = doc.y + 8;
	doc.moveTo(LEFT_X, ruleY).lineTo(RIGHT_X, ruleY).stroke();

	return ruleY + 10;
}
