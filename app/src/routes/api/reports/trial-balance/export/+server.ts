import { todayIso } from '$lib/dates';
import { formatIdr } from '$lib/money';
import { defaultReportRange, formatPeriod } from '$lib/periods';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getCompanyReportInfo } from '$lib/server/reports/company';
import { drawLetterhead, getCompanyLetterheadData } from '$lib/server/reports/pdf-letterhead';
import { createPdfDocument, finishPdf, pdfResponse } from '$lib/server/reports/pdf-scaffold';
import { getTrialBalance } from '$lib/server/reports/trial-balance';
import { rangeParams } from '$lib/server/validation';
import type { RequestHandler } from './$types';

// Landscape A4 (usable width ~742pt dengan margin 50pt) supaya 6 kolom nominal cukup lebar
// untuk angka besar seperti "125.000.000,00" tanpa membungkus ke baris kedua.
const LEFT_X = 50;
const RIGHT_X = 792;
const ROW_H = 14;

type Align = 'left' | 'right' | 'center';
const COLS: Array<{ x: number; w: number; align: Align }> = [
	{ x: 50, w: 50, align: 'left' }, // Kode
	{ x: 100, w: 200, align: 'left' }, // Akun
	{ x: 300, w: 82, align: 'right' }, // Saldo Awal Debit
	{ x: 382, w: 82, align: 'right' }, // Saldo Awal Kredit
	{ x: 464, w: 82, align: 'right' }, // Mutasi Debit
	{ x: 546, w: 82, align: 'right' }, // Mutasi Kredit
	{ x: 628, w: 82, align: 'right' }, // Saldo Akhir Debit
	{ x: 710, w: 82, align: 'right' } // Saldo Akhir Kredit
];
const GROUPS: Array<{ label: string; x: number; w: number }> = [
	{ label: 'Saldo Awal', x: 300, w: 164 },
	{ label: 'Mutasi', x: 464, w: 164 },
	{ label: 'Saldo Akhir', x: 628, w: 164 }
];

/** Sama seperti helper `cell()` di halaman: kosongkan nilai nol, selain itu format rupiah. */
const cell = (v: string) => (v !== '0.00' ? formatIdr(v) : '');

function drawRow(doc: PDFKit.PDFDocument, y: number, values: string[], opts: { bold?: boolean } = {}) {
	doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
	// lineBreak: false memastikan setiap sel tabel selalu satu baris: tanpa ini pdfkit bisa
	// membungkus atau memicu page-break otomatisnya sendiri di tengah sebuah sel.
	COLS.forEach((c, i) => doc.text(values[i] ?? '', c.x, y, { width: c.w, align: c.align, lineBreak: false }));
}

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const company = await getCompanyReportInfo(ctx.companyId);
		const range = rangeParams(event.url, defaultReportRange(todayIso(), company.fiscalYear), company.fiscalYear);
		const closing = event.url.searchParams.get('closing') === '1';
		const [tb, letterhead] = await Promise.all([
			getTrialBalance(ctx.companyId, range, { includeClosing: closing }),
			getCompanyLetterheadData(ctx.companyId)
		]);

		const doc = createPdfDocument({ layout: 'landscape' });

		let y = drawLetterhead(doc, letterhead, 'Neraca Saldo', formatPeriod(range.from, range.to));
		const pageBottom = doc.page.height - LEFT_X;
		const ensureSpace = (extra = ROW_H) => {
			if (y + extra > pageBottom) {
				doc.addPage();
				y = LEFT_X;
			}
		};

		doc.font('Helvetica-Bold').fontSize(8);
		GROUPS.forEach((g) => doc.text(g.label, g.x, y, { width: g.w, align: 'center', lineBreak: false }));
		y += ROW_H;
		drawRow(doc, y, ['Kode', 'Akun', 'Debit', 'Kredit', 'Debit', 'Kredit', 'Debit', 'Kredit'], { bold: true });
		y += ROW_H;
		doc.moveTo(LEFT_X, y).lineTo(RIGHT_X, y).stroke();
		y += 4;

		for (const r of tb.rows) {
			ensureSpace();
			drawRow(doc, y, [r.code, r.name, cell(r.openingDebit), cell(r.openingCredit), cell(r.debit), cell(r.credit), cell(r.closingDebit), cell(r.closingCredit)]);
			y += ROW_H;
		}

		ensureSpace();
		doc.moveTo(LEFT_X, y).lineTo(RIGHT_X, y).stroke();
		y += 4;
		drawRow(
			doc,
			y,
			[
				'Total',
				'',
				formatIdr(tb.totals.openingDebit),
				formatIdr(tb.totals.openingCredit),
				formatIdr(tb.totals.debit),
				formatIdr(tb.totals.credit),
				formatIdr(tb.totals.closingDebit),
				formatIdr(tb.totals.closingCredit)
			],
			{ bold: true }
		);
		y += ROW_H + 10;

		ensureSpace();
		doc.font('Helvetica-Bold').fontSize(10).text(tb.balanced ? 'Balance' : 'Tidak balance', LEFT_X, y);

		const buf = await finishPdf(doc);
		const filename = `neraca-saldo_${range.from}_${range.to}.pdf`;
		return pdfResponse(buf, filename);
	});
