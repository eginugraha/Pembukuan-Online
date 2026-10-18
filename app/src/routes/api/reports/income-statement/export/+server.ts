import { todayIso } from '$lib/dates';
import { formatAccounting } from '$lib/money';
import { defaultReportRange, formatPeriod } from '$lib/periods';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import type { IncomeLine, IncomeSection } from '$lib/server/reports/income-statement';
import { getIncomeStatementComparative } from '$lib/server/reports/income-statement';
import { getCompanyReportInfo } from '$lib/server/reports/company';
import { drawLetterhead, getCompanyLetterheadData } from '$lib/server/reports/pdf-letterhead';
import { createPdfDocument, finishPdf, pdfResponse } from '$lib/server/reports/pdf-scaffold';
import { rangeParams } from '$lib/server/validation';
import type { RequestHandler } from './$types';

const LEFT_X = 50;
const RIGHT_X = 545;
const NAME_X = 50;
const NAME_W = 300;
const CUR_X = 350;
const CUR_W = 90;
const CMP_X = 445;
const CMP_W = 100;
const ROW_H = 14;
const INDENT = 10;

function drawRow(doc: PDFKit.PDFDocument, y: number, name: string, cur: string, cmp: string, opts: { bold?: boolean; indent?: number } = {}) {
	doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
	// lineBreak: false memastikan setiap sel tabel selalu satu baris, sehingga `ensureSpace`
	// (bukan page-break otomatis pdfkit) yang mengontrol kapan halaman baru dimulai.
	doc.text(name, NAME_X + (opts.indent ?? 0), y, { width: NAME_W - (opts.indent ?? 0), lineBreak: false });
	doc.text(cur, CUR_X, y, { width: CUR_W, align: 'right', lineBreak: false });
	doc.text(cmp, CMP_X, y, { width: CMP_W, align: 'right', lineBreak: false });
}

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const company = await getCompanyReportInfo(ctx.companyId);
		const range = rangeParams(event.url, defaultReportRange(todayIso(), company.fiscalYear), company.fiscalYear);
		const [{ current, comparative }, letterhead] = await Promise.all([
			getIncomeStatementComparative(ctx.companyId, range),
			getCompanyLetterheadData(ctx.companyId)
		]);

		const doc = createPdfDocument();

		let y = drawLetterhead(doc, letterhead, 'Laba Rugi', formatPeriod(current.from, current.to));
		const pageBottom = doc.page.height - LEFT_X;
		const ensureSpace = (extra = ROW_H) => {
			if (y + extra > pageBottom) {
				doc.addPage();
				y = LEFT_X;
			}
		};

		ensureSpace();
		drawRow(doc, y, 'Keterangan', formatPeriod(current.from, current.to), formatPeriod(comparative.from, comparative.to), { bold: true });
		y += ROW_H;
		doc.moveTo(LEFT_X, y).lineTo(RIGHT_X, y).stroke();
		y += 4;

		const drawSection = (s: IncomeSection, p: IncomeSection | undefined) => {
			ensureSpace();
			drawRow(doc, y, s.title, '', '', { bold: true });
			y += ROW_H;
			for (const l of s.lines) {
				const pl: IncomeLine | undefined = p?.lines.find((x) => x.accountId === l.accountId);
				ensureSpace();
				drawRow(doc, y, `${l.code} ${l.name}`, formatAccounting(l.amount), formatAccounting(pl?.amount ?? '0.00'), { indent: INDENT });
				y += ROW_H;
			}
			if (s.lines.length === 0) {
				ensureSpace();
				drawRow(doc, y, '—', '', '', { indent: INDENT });
				y += ROW_H;
			}
			ensureSpace();
			drawRow(doc, y, `Jumlah ${s.title}`, formatAccounting(s.total), formatAccounting(p?.total ?? '0.00'), { bold: true });
			y += ROW_H;
		};

		const drawSubtotal = (label: string, value: string, prev: string) => {
			ensureSpace();
			drawRow(doc, y, label, formatAccounting(value), formatAccounting(prev), { bold: true });
			y += ROW_H;
		};

		for (const s of current.sections) {
			drawSection(s, comparative.sections.find((x) => x.key === s.key));
			if (s.key === 'cogs') drawSubtotal('Laba Kotor', current.grossProfit, comparative.grossProfit);
			else if (s.key === 'opex') drawSubtotal('Laba Usaha', current.operatingProfit, comparative.operatingProfit);
			else if (s.key === 'otherExpense') drawSubtotal('Laba Sebelum Pajak', current.profitBeforeTax, comparative.profitBeforeTax);
		}

		ensureSpace();
		doc.moveTo(CUR_X, y - 2).lineTo(RIGHT_X, y - 2).stroke();
		drawRow(doc, y, 'Laba Bersih', formatAccounting(current.netProfit), formatAccounting(comparative.netProfit), { bold: true });
		y += ROW_H;

		const buf = await finishPdf(doc);
		const filename = `laba-rugi_${current.from}_${current.to}.pdf`;
		return pdfResponse(buf, filename);
	});
