import PDFDocument from 'pdfkit';
import { todayIso } from '$lib/dates';
import { formatAccounting } from '$lib/money';
import { defaultBalanceSheetAsOf, formatDateLong } from '$lib/periods';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import type { BalanceSheetLine, BalanceSheetSection } from '$lib/server/reports/balance-sheet';
import { getBalanceSheetComparative } from '$lib/server/reports/balance-sheet';
import { getCompanyReportInfo } from '$lib/server/reports/company';
import { drawLetterhead, getCompanyLetterheadData } from '$lib/server/reports/pdf-letterhead';
import { dateParam } from '$lib/server/validation';
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

const lineKey = (l: BalanceSheetLine) => l.accountId ?? l.name;

function drawRow(doc: PDFKit.PDFDocument, y: number, name: string, cur: string, cmp: string, opts: { bold?: boolean; indent?: number } = {}) {
	doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
	doc.text(name, NAME_X + (opts.indent ?? 0), y, { width: NAME_W - (opts.indent ?? 0) });
	doc.text(cur, CUR_X, y, { width: CUR_W, align: 'right' });
	doc.text(cmp, CMP_X, y, { width: CMP_W, align: 'right' });
}

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const company = await getCompanyReportInfo(ctx.companyId);
		const asOf = dateParam(event.url, 'as_of') ?? defaultBalanceSheetAsOf(todayIso(), company.fiscalYear);
		const [{ current, comparative }, letterhead] = await Promise.all([
			getBalanceSheetComparative(ctx.companyId, asOf),
			getCompanyLetterheadData(ctx.companyId)
		]);

		const doc = new PDFDocument();
		const chunks: Buffer[] = [];
		doc.on('data', (c: Buffer) => chunks.push(c));
		const done = new Promise<void>((resolve) => doc.on('end', resolve));

		let y = drawLetterhead(doc, letterhead, 'Laporan Posisi Keuangan', `Per ${formatDateLong(current.asOf)} dan ${formatDateLong(comparative.asOf)}`);
		const pageBottom = doc.page.height - LEFT_X;
		const ensureSpace = (extra = ROW_H) => {
			if (y + extra > pageBottom) {
				doc.addPage();
				y = LEFT_X;
			}
		};

		ensureSpace();
		drawRow(doc, y, 'Keterangan', formatDateLong(current.asOf), formatDateLong(comparative.asOf), { bold: true });
		y += ROW_H;
		doc.moveTo(LEFT_X, y).lineTo(RIGHT_X, y).stroke();
		y += 4;

		const drawLine = (l: BalanceSheetLine, p: BalanceSheetLine | undefined, depth: number) => {
			const indent = INDENT * depth;
			if (l.children.length === 0) {
				ensureSpace();
				drawRow(doc, y, l.name, formatAccounting(l.amount), formatAccounting(p?.amount ?? '0.00'), { indent });
				y += ROW_H;
				return;
			}
			ensureSpace();
			drawRow(doc, y, l.name, '', '', { indent });
			y += ROW_H;
			for (const c of l.children) {
				drawLine(c, p?.children.find((x) => lineKey(x) === lineKey(c)), depth + 1);
			}
			ensureSpace();
			drawRow(doc, y, `Jumlah ${l.name}`, formatAccounting(l.amount), formatAccounting(p?.amount ?? '0.00'), { indent });
			y += ROW_H;
		};

		const drawSection = (s: BalanceSheetSection, p: BalanceSheetSection | undefined) => {
			ensureSpace();
			drawRow(doc, y, s.title, '', '', { bold: true });
			y += ROW_H;
			for (const l of s.lines) {
				drawLine(l, p?.lines.find((x) => lineKey(x) === lineKey(l)), 1);
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

		const drawGrandTotal = (label: string, value: string, prev: string) => {
			ensureSpace();
			doc.moveTo(CUR_X, y - 2).lineTo(RIGHT_X, y - 2).stroke();
			drawRow(doc, y, label, formatAccounting(value), formatAccounting(prev), { bold: true });
			y += ROW_H;
		};

		const drawHeading = (text: string) => {
			ensureSpace(ROW_H + 6);
			y += 6;
			doc.font('Helvetica-Bold').fontSize(10).text(text, NAME_X, y);
			y += ROW_H;
		};

		drawHeading('ASET');
		drawSection(current.assets.current, comparative.assets.current);
		drawSection(current.assets.nonCurrent, comparative.assets.nonCurrent);
		drawGrandTotal('JUMLAH ASET', current.assets.total, comparative.assets.total);

		drawHeading('LIABILITAS DAN EKUITAS');
		drawSection(current.liabilities.current, comparative.liabilities.current);
		drawSection(current.liabilities.nonCurrent, comparative.liabilities.nonCurrent);
		ensureSpace();
		drawRow(doc, y, 'Jumlah Liabilitas', formatAccounting(current.liabilities.total), formatAccounting(comparative.liabilities.total), { bold: true });
		y += ROW_H;
		drawSection(current.equity, comparative.equity);
		drawGrandTotal('JUMLAH LIABILITAS DAN EKUITAS', current.totalLiabilitiesAndEquity, comparative.totalLiabilitiesAndEquity);

		const badDates = [...(current.balanced ? [] : [current.asOf]), ...(comparative.balanced ? [] : [comparative.asOf])]
			.map(formatDateLong)
			.join(' dan ');
		if (!current.balanced || !comparative.balanced) {
			y += 10;
			ensureSpace();
			doc.font('Helvetica').fontSize(9).text(
				`Jumlah aset tidak sama dengan jumlah liabilitas dan ekuitas per ${badDates}. Periksa saldo awal dan jurnal.`,
				LEFT_X,
				y,
				{ width: RIGHT_X - LEFT_X }
			);
		}

		doc.end();
		await done;

		const filename = `laporan-posisi-keuangan_${current.asOf}.pdf`;
		return new Response(Buffer.concat(chunks), {
			headers: {
				'content-type': 'application/pdf',
				'content-disposition': `attachment; filename="${filename}"`
			}
		});
	});
