import PDFDocument from 'pdfkit';

/**
 * Margin yang konsisten dengan asumsi math `ensureSpace`/koordinat kolom di tiap rute laporan
 * (LEFT_X/RIGHT_X ~50/545 untuk A4 portrait). Tanpa ini, default pdfkit (LETTER, margin 72pt)
 * membuat ambang page-break internalnya sendiri (72pt dari tepi) tidak sinkron dengan ambang
 * manual tiap rute (~50pt), sehingga satu baris tabel bisa terpotong di tengah oleh page-break
 * otomatis pdfkit sendiri.
 */
const MARGINS = { top: 50, bottom: 50, left: 50, right: 50 };

/** Satu tempat untuk membuat `PDFDocument` dengan ukuran halaman & margin yang selalu konsisten
 * di semua rute ekspor PDF, supaya ambang page-break pdfkit tidak pernah drift dari math
 * `ensureSpace` masing-masing rute. */
export function createPdfDocument(opts: { layout?: 'portrait' | 'landscape' } = {}): PDFKit.PDFDocument {
	return new PDFDocument({ size: 'A4', layout: opts.layout ?? 'portrait', margins: MARGINS });
}

/** Mengumpulkan seluruh chunk dari `doc` lalu menyelesaikannya menjadi satu `Uint8Array`, setelah
 * memanggil `doc.end()`. Tipe `Uint8Array<ArrayBuffer>` (bukan `Buffer`) dipakai agar cocok
 * dengan `BodyInit`, sama seperti konvensi rute Excel/CSV lain di repo ini. */
export function finishPdf(doc: PDFKit.PDFDocument): Promise<Uint8Array<ArrayBuffer>> {
	const chunks: Buffer[] = [];
	doc.on('data', (c: Buffer) => chunks.push(c));
	const done = new Promise<Uint8Array<ArrayBuffer>>((resolve) =>
		doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
	);
	doc.end();
	return done;
}

/** Membungkus buffer PDF jadi `Response` HTTP dengan header unduhan standar. */
export function pdfResponse(buf: Uint8Array<ArrayBuffer>, filename: string): Response {
	return new Response(buf, {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `attachment; filename="${filename}"`
		}
	});
}
