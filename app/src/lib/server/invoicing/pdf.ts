import { D, formatIdr } from '$lib/money';

const LEFT_X = 50;
const RIGHT_X = 545;
const ROW_H = 16;

type Align = 'left' | 'right' | 'center';
const COLS: Array<{ x: number; w: number; align: Align; label: string }> = [
	{ x: 50, w: 215, align: 'left', label: 'Keterangan' },
	{ x: 265, w: 60, align: 'right', label: 'Qty' },
	{ x: 325, w: 110, align: 'right', label: 'Harga Satuan' },
	{ x: 435, w: 110, align: 'right', label: 'Jumlah' }
];

function drawRow(doc: PDFKit.PDFDocument, y: number, values: string[], opts: { bold?: boolean } = {}) {
	doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
	// lineBreak: false memastikan setiap sel tabel selalu satu baris: tanpa ini pdfkit bisa
	// membungkus atau memicu page-break otomatisnya sendiri di tengah sebuah sel (sama seperti
	// fix yang sudah dipakai di tabel-tabel PDF fitur Export).
	COLS.forEach((c, i) => doc.text(values[i] ?? '', c.x, y, { width: c.w, align: c.align, lineBreak: false }));
}

/**
 * Menggambar blok kontak + tabel baris dokumen (Invoice/Purchase Order) mulai dari koordinat `y`
 * yang diberikan. Fungsi gambar murni: tidak memanggil `createPdfDocument`/`finishPdf`/
 * `pdfResponse` — itu tanggung jawab rute pemanggil, sama seperti rute-rute PDF Export yang
 * memanggil `drawLetterhead` lalu kode tabelnya sendiri lalu `finishPdf`. Tidak pernah
 * menampilkan kode akun GL internal, sesuai spesifikasi dokumen yang dicetak.
 */
export function drawDocumentPdf(
	doc: PDFKit.PDFDocument,
	y: number,
	opts: {
		contact: { name: string; address?: string | null; npwp?: string | null };
		lines: { description: string; quantity: string; unitPrice: string; amount: string }[];
		subtotal: string;
		taxRate?: string | null;
		taxAmount?: string | null;
		total: string;
		notes?: string | null;
		statusLabel: string;
	}
): void {
	doc.font('Helvetica-Bold').fontSize(10).text(opts.contact.name, LEFT_X, y, { lineBreak: false });
	y += 14;
	doc.font('Helvetica').fontSize(9);
	if (opts.contact.address) {
		doc.text(opts.contact.address, LEFT_X, y);
		y = doc.y;
	}
	if (opts.contact.npwp) {
		doc.text(`NPWP: ${opts.contact.npwp}`, LEFT_X, y, { lineBreak: false });
		y += 12;
	}
	y += 10;

	drawRow(doc, y, COLS.map((c) => c.label), { bold: true });
	y += ROW_H;
	doc.moveTo(LEFT_X, y).lineTo(RIGHT_X, y).stroke();
	y += 6;

	for (const line of opts.lines) {
		drawRow(doc, y, [line.description, line.quantity, formatIdr(line.unitPrice), formatIdr(line.amount)]);
		y += ROW_H;
	}

	y += 4;
	doc.moveTo(LEFT_X, y).lineTo(RIGHT_X, y).stroke();
	y += 8;

	const totalsRow = (label: string, value: string, opts2: { bold?: boolean } = {}) => {
		doc.font(opts2.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
		doc.text(label, 325, y, { width: 110, align: 'right', lineBreak: false });
		doc.text(formatIdr(value), 435, y, { width: 110, align: 'right', lineBreak: false });
		y += ROW_H;
	};

	totalsRow('Subtotal', opts.subtotal);
	if (opts.taxRate && D(opts.taxRate).gt(0)) {
		totalsRow(`PPN (${opts.taxRate}%)`, opts.taxAmount ?? '0');
	}
	totalsRow('Total', opts.total, { bold: true });

	y += 10;
	if (opts.notes) {
		doc.font('Helvetica').fontSize(9).text(opts.notes, LEFT_X, y, { width: RIGHT_X - LEFT_X });
		y = doc.y + 10;
	}

	doc.font('Helvetica-Bold').fontSize(10).text(`Status: ${opts.statusLabel}`, LEFT_X, y, { lineBreak: false });
}
