import { D, formatIdr, type MoneyValue } from '$lib/money';
import { terbilang } from '$lib/terbilang';
import type { InvoiceCompanyData } from '$lib/server/reports/company';
import type { ContactRow } from './contacts';
import type { InvoiceDetail } from './invoices';

/*
 * PDF invoice sesuai mockup revisi 9 (docs/superpowers/specs/assets/2026-10-26-invoice-mockup.html).
 * Mockup memakai kertas 640px dengan padding 30px (lebar konten 580px); di sini lebar konten A4
 * 495pt, jadi ukuran di mockup dikali ±0,85 untuk mendapat pt.
 */

const TEXT = '#1b1b1b';
const MUTED = '#777777';
const EN = '#888888';
const TH_EN = '#999999';
const NAME = '#1f2a44';
const ICON = '#555555';
const RULE_HEAD = '#bbbbbb';
const RULE_ROW = '#eeeeee';
const RULE_TOTAL = '#dddddd';
const CARD_FILL = '#fafafa';
const CARD_STROKE = '#eeeeee';

const REG = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const ITALIC = 'Helvetica-Oblique';

/** Lebar kolom kanan atas (INVOICE, nomor/tanggal) dan kolom "BILL TO". */
const RIGHT_COL_W = 190;
const CELL_PAD = 5;
const LOGO_SIZE = 26;
const SIGNATURE_BOX = { w: 130, h: 46 };

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** "2026-09-29" → "29 September 2026". */
export function formatLongDate(iso: string): string {
	const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
	return `${d} ${BULAN[m - 1]} ${y}`;
}

/** "Rp 10.000.000" (sen hanya ditulis bila tidak nol), negatif "-Rp 100.000". */
export function formatRupiah(v: MoneyValue): string {
	const s = formatIdr(v);
	const trimmed = s.endsWith(',00') ? s.slice(0, -3) : s;
	return trimmed.startsWith('-') ? `-Rp ${trimmed.slice(1)}` : `Rp ${trimmed}`;
}

/** Angka tanpa nol di belakang, pemisah ribuan titik dan desimal koma: "1.000", "1,5". */
function formatPlain(v: MoneyValue): string {
	const [int, frac] = D(v).toFixed().split('.');
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return frac ? `${grouped},${frac.replace(/0+$/, '')}`.replace(/,$/, '') : grouped;
}

/** Nomor telepon untuk tautan `tel:`: hanya digit, dengan "+" di depan bila ada. */
function telHref(phone: string): string {
	const digits = phone.replace(/[^\d]/g, '');
	return `tel:${phone.trim().startsWith('+') ? '+' : ''}${digits}`;
}

/** Gambar yang sudah dibuka `pdfkit` (`doc.openImage`, belum ada di @types/pdfkit). `doc.image`
 * menerima objek ini langsung, jadi gambar yang dipakai di tiap halaman hanya disisipkan sekali. */
type Img = { width: number; height: number };
type ImageSrc = Parameters<PDFKit.PDFDocument['image']>[0];
const asSrc = (img: Img) => img as unknown as ImageSrc;

/** Gambar yang tidak bisa dibuka `pdfkit` dianggap tidak ada, bukan menggagalkan PDF. */
function openSafe(doc: PDFKit.PDFDocument, buf: Buffer | null): Img | null {
	if (!buf) return null;
	try {
		return (doc as unknown as { openImage(src: Buffer): Img }).openImage(buf);
	} catch {
		return null;
	}
}

/** Satu blok penutup yang tingginya diukur dulu supaya tidak terpotong di tengah halaman. */
interface Block {
	gap: number;
	height: number;
	draw: (y: number) => void;
}

export function drawInvoicePdf(
	doc: PDFKit.PDFDocument,
	d: { company: InvoiceCompanyData; contact: ContactRow; invoice: InvoiceDetail }
): void {
	const { company, contact, invoice } = d;
	const L = doc.page.margins.left;
	const R = doc.page.width - doc.page.margins.right;
	const W = R - L;
	const TOP = doc.page.margins.top;
	const BOTTOM = doc.page.height - doc.page.margins.bottom;
	const RX = R - RIGHT_COL_W;

	const logo = openSafe(doc, company.logoPng);
	const signature = openSafe(doc, company.signaturePng);
	const watermark = openSafe(doc, company.watermarkPng);

	// Watermark: digambar pertama di setiap halaman (di belakang konten), kanan bawah, melewati
	// margin kanan seperti `right:-40px; bottom:140px; width:500px` di mockup.
	const drawWatermark = () => {
		if (!watermark) return;
		const w = W * 0.78;
		const h = (w * watermark.height) / watermark.width;
		const x = R + 30 - w;
		const y = doc.page.height - 150 - h;
		try {
			doc.opacity(0.75);
			doc.image(asSrc(watermark), x, y, { width: w, height: h });
		} catch {
			// Gambar rusak cukup dilewati.
		} finally {
			doc.opacity(1);
		}
	};
	drawWatermark();
	doc.on('pageAdded', drawWatermark);

	const lineH = (font: string, size: number) => doc.font(font).fontSize(size).currentLineHeight(true);
	const heightOf = (text: string, font: string, size: number, width: number) =>
		doc.font(font).fontSize(size).heightOfString(text, { width });

	/** Teks satu baris tanpa pembungkusan. */
	const line = (
		text: string,
		x: number,
		y: number,
		o: { font?: string; size?: number; color?: string; width?: number; align?: 'left' | 'right'; link?: string; spacing?: number } = {}
	) => {
		doc
			.font(o.font ?? REG)
			.fontSize(o.size ?? 9)
			.fillColor(o.color ?? TEXT)
			.text(text, x, y, {
				lineBreak: false,
				width: o.width,
				align: o.align ?? 'left',
				characterSpacing: o.spacing ?? 0,
				...(o.link ? { link: o.link, underline: false } : {})
			});
	};

	/** Teks yang boleh dibungkus; mengembalikan tinggi yang dipakai. */
	const para = (text: string, x: number, y: number, width: number, o: { font?: string; size?: number; color?: string; align?: 'left' | 'right'; link?: string } = {}) => {
		const font = o.font ?? REG;
		const size = o.size ?? 9;
		const h = heightOf(text, font, size, width);
		doc
			.font(font)
			.fontSize(size)
			.fillColor(o.color ?? TEXT)
			.text(text, x, y, { width, align: o.align ?? 'left', ...(o.link ? { link: o.link, underline: false } : {}) });
		return h;
	};

	/** Label dwibahasa: bagian Indonesia (tegak) diikuti "/ English" miring abu-abu, sejajar baseline. */
	const biLabel = (id: string, en: string, x: number, y: number, o: { font?: string; size: number; enSize: number; color?: string }) => {
		const font = o.font ?? BOLD;
		const head = `${id} `;
		line(head, x, y, { font, size: o.size, color: o.color ?? TEXT });
		const wHead = doc.font(font).fontSize(o.size).widthOfString(head);
		// pdfkit menaruh teks dari puncak ascender; geser supaya baseline kedua ukuran sama.
		const dy = ((o.size - o.enSize) * 718) / 1000;
		line(`/ ${en}`, x + wHead, y + dy, { font: ITALIC, size: o.enSize, color: EN });
		return lineH(font, o.size);
	};

	/** Ukuran huruf yang diperkecil bila teks satu baris melebihi lebar kolom. */
	const fitSize = (text: string, font: string, size: number, width: number, min = 7) => {
		let s = size;
		while (s > min && doc.font(font).fontSize(s).widthOfString(text) > width) s -= 0.5;
		return s;
	};

	const ICON_SIZE = 9;
	const drawIcon = (kind: 'mail' | 'phone', x: number, y: number) => {
		doc.save();
		doc.translate(x, y).scale(ICON_SIZE / 24);
		doc.lineWidth(1.6).lineJoin('round').lineCap('round').strokeColor(ICON);
		if (kind === 'mail') {
			doc.roundedRect(3, 5, 18, 14, 2).stroke();
			doc.path('M3 7l9 6 9-6').stroke();
		} else {
			doc.path('M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2').stroke();
		}
		doc.restore();
	};

	const rule = (y: number, color: string, width: number) => {
		doc.save().moveTo(L, y).lineTo(R, y).lineWidth(width).strokeColor(color).stroke().restore();
	};

	// ── Kiri atas: logo + nama, alamat, email, telepon ──────────────────────────────────────────
	const leftW = RX - L - 20;
	let ly = TOP;
	{
		const nameX = logo ? L + LOGO_SIZE + 8 : L;
		const nameW = L + leftW - nameX;
		const nameSize = 14;
		const nameH = heightOf(company.name, BOLD, nameSize, nameW);
		if (logo) {
			try {
				doc.image(asSrc(logo), L, TOP, { fit: [LOGO_SIZE, LOGO_SIZE], align: 'center', valign: 'center' });
			} catch {
				// abaikan logo rusak
			}
		}
		const nameY = logo && nameH < LOGO_SIZE ? TOP + (LOGO_SIZE - nameH) / 2 + 1 : TOP;
		para(company.name, nameX, nameY, nameW, { font: BOLD, size: nameSize, color: NAME });
		ly = Math.max(logo ? TOP + LOGO_SIZE : TOP, nameY + nameH) + 5;
		if (company.address) {
			ly += para(company.address, L, ly, leftW, { size: 8, color: MUTED });
		}
		ly += 3;
		const contactRow = (kind: 'mail' | 'phone', text: string, link: string) => {
			drawIcon(kind, L, ly);
			line(text, L + ICON_SIZE + 4, ly + 1, { size: 8, color: MUTED, link });
			ly += 12;
		};
		if (company.email) contactRow('mail', company.email, `mailto:${company.email.trim()}`);
		if (company.phone) contactRow('phone', company.phone, telHref(company.phone));
	}

	// ── Kanan atas: INVOICE / Tagihan + nomor, tanggal, jatuh tempo ─────────────────────────────
	let ry = TOP;
	{
		line('INVOICE', RX, ry, { font: BOLD, size: 13, spacing: 0.3 });
		ry += lineH(BOLD, 13);
		line('Tagihan', RX, ry, { font: ITALIC, size: 8.5, color: EN });
		ry += lineH(ITALIC, 8.5) + 6;
		const kv = (id: string, en: string, value: string) => {
			ry += biLabel(id, en, RX, ry, { size: 9, enSize: 8.5 });
			const size = fitSize(value, BOLD, 11, RIGHT_COL_W);
			if (doc.font(BOLD).fontSize(size).widthOfString(value) > RIGHT_COL_W) {
				// Tetap tidak muat pada ukuran minimum: bungkus di dalam lebar kolom.
				ry += para(value, RX, ry + 1, RIGHT_COL_W, { font: BOLD, size }) + 7;
				return;
			}
			line(value, RX, ry + 1, { font: BOLD, size });
			ry += lineH(BOLD, 11) + 6;
		};
		kv('Nomor Invoice', 'Invoice Number', invoice.invoiceNo);
		kv('Tanggal', 'Issue Date', formatLongDate(invoice.issueDate));
		if (invoice.dueDate) kv('Jatuh Tempo', 'Due Date', formatLongDate(invoice.dueDate));
	}

	let y = Math.max(ly, ry) + 10;

	// ── Baris kedua: PERIHAL (kiri) dan BILL TO (kanan) ─────────────────────────────────────────
	{
		const tag = (text: string, x: number, ty: number) => {
			line(text, x, ty, { font: BOLD, size: 7.5, color: MUTED, spacing: 0.3 });
			return lineH(BOLD, 7.5) + 2;
		};
		let sy = y;
		if (invoice.subject) {
			sy += tag('PERIHAL / SUBJECT', L, sy);
			sy += para(invoice.subject, L, sy, W * 0.52, { font: BOLD, size: 9 });
		}
		let by = y;
		by += tag('DITAGIHKAN KEPADA / BILL TO', RX, by);
		by += para(contact.name, RX, by, RIGHT_COL_W, { font: BOLD, size: 9 });
		if (contact.attention) {
			const attn = [contact.attention, contact.position].filter(Boolean).join(', ');
			by += para(`Attn: ${attn}`, RX, by, RIGHT_COL_W, { font: BOLD, size: 9 });
		}
		by += 1;
		const muted = { size: 8.5, color: MUTED };
		if (contact.address) by += para(contact.address, RX, by, RIGHT_COL_W, muted);
		if (contact.email) by += para(contact.email, RX, by, RIGHT_COL_W, { ...muted, link: `mailto:${contact.email.trim()}` });
		if (contact.phone) by += para(contact.phone, RX, by, RIGHT_COL_W, { ...muted, link: telHref(contact.phone) });
		if (contact.npwp) by += para(`NPWP ${contact.npwp}`, RX, by, RIGHT_COL_W, muted);
		y = Math.max(sy, by) + 16;
	}

	const newPage = () => {
		doc.addPage();
		y = TOP;
	};

	// ── RINCIAN TAGIHAN / Billing Summary ───────────────────────────────────────────────────────
	const QTY_W = 55;
	const PRICE_W = 100;
	const TOTAL_W = 105;
	const DESC_W = W - QTY_W - PRICE_W - TOTAL_W;
	// Kolom pertama rata tepi kiri konten, kolom terakhir rata tepi kanan konten (tanpa padding).
	const cols = {
		desc: { x: L, w: DESC_W - CELL_PAD },
		qty: { x: L + DESC_W + CELL_PAD, w: QTY_W - CELL_PAD * 2 },
		price: { x: L + DESC_W + QTY_W + CELL_PAD, w: PRICE_W - CELL_PAD * 2 },
		total: { x: R - TOTAL_W + CELL_PAD, w: TOTAL_W - CELL_PAD }
	};

	const headerH = CELL_PAD + lineH(BOLD, 9) + lineH(ITALIC, 7) + CELL_PAD;
	const drawTableHeader = () => {
		const th = (id: string, en: string, c: { x: number; w: number }, align: 'left' | 'right') => {
			line(id, c.x, y + CELL_PAD, { font: BOLD, size: 9, width: c.w, align });
			line(en, c.x, y + CELL_PAD + lineH(BOLD, 9), { font: ITALIC, size: 7, color: TH_EN, width: c.w, align });
		};
		th('Keterangan', 'Description', cols.desc, 'left');
		th('Jumlah', 'Quantity', cols.qty, 'left');
		th('Harga (Rp)', 'Price (Rp)', cols.price, 'right');
		th('Jumlah Harga (Rp)', 'Total Price (Rp)', cols.total, 'right');
		y += headerH;
		rule(y, RULE_HEAD, 1.2);
	};

	const CELL = 8.5;
	const rowH = (desc: string) => CELL_PAD + Math.max(heightOf(desc, REG, CELL, cols.desc.w), lineH(REG, CELL)) + CELL_PAD;

	// Judul + header tabel + baris pertama harus muat bersama; bila tidak, pindah halaman SEBELUM judul.
	const headingH = lineH(BOLD, 10) + 5;
	if (y + headingH + headerH + rowH(invoice.lines[0]?.description ?? '') > BOTTOM) newPage();
	y += biLabel('RINCIAN TAGIHAN', 'Billing Summary', L, y, { size: 10, enSize: 8.5 }) + 5;
	drawTableHeader();

	for (const l of invoice.lines) {
		const h = rowH(l.description);
		if (y + h > BOTTOM) {
			newPage();
			drawTableHeader();
		}
		const ty = y + CELL_PAD;
		para(l.description, cols.desc.x, ty, cols.desc.w, { size: CELL });
		line(`x${formatPlain(l.quantity)}`, cols.qty.x, ty, { size: CELL, width: cols.qty.w });
		line(formatRupiah(l.unitPrice), cols.price.x, ty, { size: CELL, width: cols.price.w, align: 'right' });
		line(formatRupiah(l.amount), cols.total.x, ty, { size: CELL, width: cols.total.w, align: 'right' });
		y += h;
		rule(y, RULE_ROW, 0.75);
	}

	// Baris ringkasan: Subtotal/Diskon/PPN hanya bila ada diskon atau PPN, lalu Total (tebal).
	const summary: Array<{ label: string; value: string; bold?: boolean }> = [];
	const hasDiscount = D(invoice.discount || 0).gt(0);
	const hasTax = D(invoice.taxRate || 0).gt(0);
	if (hasDiscount || hasTax) {
		summary.push({ label: 'Subtotal', value: formatRupiah(invoice.subtotal) });
		if (hasDiscount) summary.push({ label: 'Diskon / Discount', value: formatRupiah(D(invoice.discount).neg().toString()) });
		if (hasTax) summary.push({ label: `PPN / VAT (${formatPlain(invoice.taxRate!)}%)`, value: formatRupiah(invoice.taxAmount) });
	}
	summary.push({ label: 'Total', value: formatRupiah(invoice.total), bold: true });
	const sumRowH = CELL_PAD * 2 + lineH(BOLD, 9);
	if (y + sumRowH * summary.length > BOTTOM) {
		newPage();
		drawTableHeader();
	}
	summary.forEach((s, i) => {
		const font = s.bold ? BOLD : REG;
		const ty = y + CELL_PAD;
		line(s.label, cols.desc.x, ty, { font, size: 9, width: cols.desc.w + QTY_W });
		line(s.value, cols.price.x, ty, { font, size: 9, width: R - cols.price.x, align: 'right' });
		y += sumRowH;
		const last = i === summary.length - 1;
		rule(y, last ? RULE_TOTAL : RULE_ROW, last ? 1.6 : 0.75);
	});

	// ── Blok penutup: terbilang, kartu pembayaran, catatan, tanda tangan ────────────────────────
	const blocks: Block[] = [];

	{
		const words = terbilang(invoice.total);
		const headH = lineH(BOLD, 10) + 3;
		const wordsH = heightOf(words, REG, 11, W);
		blocks.push({
			gap: 14,
			height: headH + wordsH,
			draw: (by) => {
				biLabel('TERBILANG', 'Amount in Words', L, by, { size: 10, enSize: 8.5 });
				para(words, L, by + headH, W, { size: 11 });
			}
		});
	}

	if (company.bankName || company.bankAccountNo) {
		const PAD_X = 9;
		const PAD_Y = 7;
		const bank = [company.bankName, company.bankAccountNo].filter(Boolean).join(' ');
		const rows: Array<{ text: string; font: string; size: number; color: string; gapBefore: number }> = [
			{ text: bank, font: BOLD, size: 10, color: TEXT, gapBefore: 3 }
		];
		if (company.bankAccountHolder) rows.push({ text: `a.n. ${company.bankAccountHolder}`, font: REG, size: 8.5, color: TEXT, gapBefore: 1 });
		if (company.swiftCode) rows.push({ text: `SWIFT ${company.swiftCode}`, font: REG, size: 8, color: MUTED, gapBefore: 1 });
		const headId = 'INFORMASI PEMBAYARAN ';
		const headW = doc.font(BOLD).fontSize(9).widthOfString(headId) + doc.font(ITALIC).fontSize(8.5).widthOfString('/ Payment Information');
		const innerW = Math.max(headW, ...rows.map((r) => doc.font(r.font).fontSize(r.size).widthOfString(r.text)));
		const cardW = Math.min(W, Math.max(205, innerW + PAD_X * 2 + 2));
		const contentH = lineH(BOLD, 9) + rows.reduce((a, r) => a + r.gapBefore + lineH(r.font, r.size), 0);
		const cardH = PAD_Y * 2 + contentH;
		blocks.push({
			gap: 12,
			height: cardH,
			draw: (by) => {
				doc.save().roundedRect(L, by, cardW, cardH, 5).lineWidth(0.75).fillAndStroke(CARD_FILL, CARD_STROKE).restore();
				let cy = by + PAD_Y;
				cy += biLabel('INFORMASI PEMBAYARAN', 'Payment Information', L + PAD_X, cy, { size: 9, enSize: 8.5 });
				for (const r of rows) {
					cy += r.gapBefore;
					line(r.text, L + PAD_X, cy, { font: r.font, size: r.size, color: r.color, width: cardW - PAD_X * 2 });
					cy += lineH(r.font, r.size);
				}
			}
		});
	}

	if (invoice.notes) {
		const notes = invoice.notes;
		blocks.push({
			gap: 12,
			height: heightOf(notes, REG, 8.5, W),
			draw: (by) => para(notes, L, by, W, { size: 8.5 })
		});
	}

	let signatureBlock: Block | null = null;
	if (company.signerName || company.signerTitle) {
		const nameRows = [company.signerName && { text: company.signerName, font: BOLD }, company.signerTitle && { text: company.signerTitle, font: REG }].filter(
			(r): r is { text: string; font: string } => Boolean(r)
		);
		const headH = lineH(BOLD, 9) + 4;
		const height = headH + SIGNATURE_BOX.h + 4 + nameRows.reduce((a, r) => a + lineH(r.font, 9), 0);
		signatureBlock = {
			gap: 18,
			height,
			draw: (by) => {
				line('Approved by,', L, by, { font: BOLD, size: 9, width: W, align: 'right' });
				let sy = by + headH;
				// Tanpa gambar tanda tangan: ruang kosong setinggi tanda tangan untuk tanda tangan basah.
				if (signature) {
					try {
						doc.image(asSrc(signature), R - SIGNATURE_BOX.w, sy, { fit: [SIGNATURE_BOX.w, SIGNATURE_BOX.h], align: 'right', valign: 'bottom' });
					} catch {
						// abaikan gambar rusak
					}
				}
				sy += SIGNATURE_BOX.h + 4;
				for (const r of nameRows) {
					line(r.text, L, sy, { font: r.font, size: 9, width: W, align: 'right' });
					sy += lineH(r.font, 9);
				}
			}
		};
		blocks.push(signatureBlock);
	}

	// Blok penutup dijaga utuh: bila seluruhnya muat di satu halaman, semuanya pindah bersama
	// (terbilang selalu berada di halaman yang sama dengan tanda tangan). Bila tidak muat, tiap
	// blok dijaga sendiri-sendiri, dan blok tanda tangan selalu pindah bersama blok sebelumnya.
	const span = (bs: Block[]) => bs.reduce((a, b, i) => a + (i === 0 ? 0 : b.gap) + b.height, 0);
	const all = span(blocks);
	if (y + blocks[0].gap + all > BOTTOM && TOP + all <= BOTTOM) newPage();
	blocks.forEach((b, i) => {
		const next = blocks[i + 1];
		const need = b.height + (next && next === signatureBlock ? next.gap + next.height : 0);
		const atTop = y === TOP;
		if (!atTop && y + b.gap + need > BOTTOM) newPage();
		if (y !== TOP) y += b.gap;
		b.draw(y);
		y += b.height;
	});

	doc.fillColor(TEXT);
}
