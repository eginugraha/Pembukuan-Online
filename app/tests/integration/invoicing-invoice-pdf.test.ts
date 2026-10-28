import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { PDFParse } from 'pdf-parse';
import encodeWebp from '@jsquash/webp/encode';
import { GET } from '../../src/routes/api/invoicing/invoices/[id]/pdf/+server';
import { createInvoice, type CreateInvoiceInput } from '../../src/lib/server/invoicing/invoices';
import { createSigner, updateSigner } from '../../src/lib/server/company/signers';
import { setCompanyAsset } from '../../src/lib/server/company/assets';
import { db } from '../../src/lib/server/db';
import { companies, contacts, invoices } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser, addMember, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function parse(res: Response) {
	const bytes = new Uint8Array(await res.arrayBuffer());
	// pdf-parse detaches the buffer it is given, so read the raw bytes first.
	const raw = Buffer.from(bytes).toString('latin1');
	const result = await new PDFParse({ data: bytes }).getText();
	return { result, text: result.text, raw };
}

const FULL_COMPANY = {
	address: 'Jl. Uji No. 1, Bandung',
	email: 'finance@uji.test',
	phone: '+62 878-1111-2222',
	bankName: 'BCA',
	bankAccountNo: '233-0636800',
	bankAccountHolder: 'PT Uji',
	swiftCode: 'CENAIDJA'
};

const FULL_CONTACT = {
	attention: 'Budi Santoso',
	position: 'Manajer Keuangan',
	address: 'Denpasar, Indonesia',
	email: 'budi@pelanggan.test',
	phone: '+62 812-3456-7890',
	npwp: '01.234.567.8-901.000'
};

async function setup(opts: { company?: Partial<typeof FULL_COMPANY>; contact?: Partial<typeof FULL_CONTACT>; invoice?: Partial<CreateInvoiceInput> } = {}) {
	const { companyId } = await makeCompany();
	if (opts.company) await db.update(companies).set(opts.company).where(eq(companies.id, companyId));
	const signerId = opts.company ? await createSigner(companyId, { name: 'Sari Penanda', title: 'Direktur Utama' }) : null;
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const [contact] = await db
		.insert(contacts)
		.values({ companyId, kind: 'CUSTOMER', name: 'PT Pelanggan Uji', code: 'PLG', ...opts.contact })
		.returning();
	const { id } = await createInvoice(companyId, u.id, {
		contactId: contact.id,
		issueDate: '2026-10-01',
		lines: [{ description: 'Jasa konsultasi', quantity: '1', unitPrice: '1500000' }],
		...opts.invoice
	});
	const fetchPdf = async () =>
		GET(fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/invoices/${id}/pdf`, params: { id } }) as never);
	return { companyId, signerId: signerId!, fetchPdf };
}

test('full data: every block of the mockup is printed, with clickable email/phone', async () => {
	const { fetchPdf } = await setup({
		company: FULL_COMPANY,
		contact: FULL_CONTACT,
		invoice: { dueDate: '2026-10-08', subject: 'Pengembangan Website Portal', notes: 'Hubungi kami untuk pertanyaan invoice.' }
	});
	const res = await fetchPdf();
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('application/pdf');
	expect(res.headers.get('content-disposition')).toBe('attachment; filename="invoice-001-UJI-PLG-INV-X-2026.pdf"');
	const { text, raw } = await parse(res);
	for (const s of [
		'INVOICE',
		'Tagihan',
		'Nomor Invoice / Invoice Number',
		'001/UJI-PLG/INV/X/2026',
		'Tanggal / Issue Date',
		'1 Oktober 2026',
		'Jatuh Tempo / Due Date',
		'8 Oktober 2026',
		'PERIHAL / SUBJECT',
		'Pengembangan Website Portal',
		'DITAGIHKAN KEPADA / BILL TO',
		'PT Pelanggan Uji',
		'Attn: Budi Santoso, Manajer Keuangan',
		'Denpasar, Indonesia',
		'budi@pelanggan.test',
		'+62 812-3456-7890',
		'NPWP 01.234.567.8-901.000',
		'RINCIAN TAGIHAN',
		'Jasa konsultasi',
		'1.500.000',
		'TERBILANG / Amount in Words',
		'Satu Juta Lima Ratus Ribu Rupiah',
		'INFORMASI PEMBAYARAN / Payment Information',
		'BCA 233-0636800',
		'a.n. PT Uji',
		'SWIFT CENAIDJA',
		'Hubungi kami untuk pertanyaan invoice.',
		'Approved by,',
		'Sari Penanda',
		'Direktur Utama',
		'finance@uji.test',
		'+62 878-1111-2222'
	]) {
		expect(text).toContain(s);
	}
	// Kuantitas tanpa awalan "x".
	expect(text).not.toMatch(/\bx1\b/);
	expect(text).toMatch(/Jasa konsultasi\s+1\s/);
	expect(raw).toContain('mailto:finance@uji.test');
	expect(raw).toContain('mailto:budi@pelanggan.test');
	expect(raw).toContain('tel:+6287811112222');
	expect(raw).toContain('tel:+6281234567890');
	// No discount and no PPN: only the Total row, like the mockup.
	expect(text).not.toContain('Subtotal');
});

test('USD invoice prints dollar amounts, USD column labels, and dollar terbilang', async () => {
	const { fetchPdf } = await setup({ invoice: { currency: 'USD', lines: [{ description: 'Consulting', quantity: '1', unitPrice: '1250' }] } });
	const { text } = await parse(await fetchPdf());
	expect(text).toContain('Harga (USD)');
	expect(text).toContain('Jumlah Harga (USD)');
	expect(text).toContain('$1,250.00');
	expect(text).toContain('Seribu Dua Ratus Lima Puluh Dolar Amerika Serikat');
	expect(text).not.toContain('Rp');
	expect(text).not.toContain('Rupiah');
});

test('company name is printed above a multi-line address', async () => {
	const { fetchPdf } = await setup({ company: { address: 'Jl. Uji No. 1\nKota Bandung 40265' } });
	const { text } = await parse(await fetchPdf());
	const name = text.indexOf('PT Uji Coba');
	expect(name).toBeGreaterThanOrEqual(0);
	expect(name).toBeLessThan(text.indexOf('Jl. Uji No. 1'));
	expect(text.indexOf('Jl. Uji No. 1')).toBeLessThan(text.indexOf('Kota Bandung 40265'));
	expect(text).not.toContain('Jl. Uji No. 1\\n');
});

test('minimal data: optional blocks are skipped, total still printed', async () => {
	const { fetchPdf } = await setup();
	const res = await fetchPdf();
	expect(res.status).toBe(200);
	const { text, raw } = await parse(res);
	expect(text).not.toContain('PERIHAL');
	expect(text).not.toContain('INFORMASI PEMBAYARAN');
	expect(text).not.toContain('Approved by');
	expect(text).not.toContain('Jatuh Tempo');
	expect(text).not.toContain('Attn:');
	expect(text).not.toContain('NPWP');
	expect(raw).not.toContain('mailto:');
	expect(raw).not.toContain('tel:');
	expect(text).toContain('DITAGIHKAN KEPADA / BILL TO');
	expect(text).toContain('Total');
	expect(text).toContain('1.500.000');
	expect(text).toContain('Satu Juta Lima Ratus Ribu Rupiah');
});

test('discount and PPN add Subtotal, Diskon and PPN rows before Total', async () => {
	const { fetchPdf } = await setup({ invoice: { discount: '100000', taxRate: '11' } });
	const { text } = await parse(await fetchPdf());
	expect(text).toContain('Subtotal');
	expect(text).toContain('Diskon / Discount');
	expect(text).toContain('-Rp 100.000');
	expect(text).toContain('PPN / VAT (11%)');
	expect(text).toContain('154.000'); // 11% x 1.400.000
	expect(text).toContain('1.554.000');
	expect(text.indexOf('Subtotal')).toBeLessThan(text.indexOf('Diskon / Discount'));
	expect(text.indexOf('PPN / VAT (11%)')).toBeLessThan(text.lastIndexOf('Total'));
});

test('a 60-line invoice paginates: each line once, header repeated, closing blocks on the last page', async () => {
	const N = 60;
	const desc = (i: number) => `Baris ke-${String(i).padStart(2, '0')}`;
	const { fetchPdf } = await setup({
		company: FULL_COMPANY,
		invoice: {
			notes: 'Catatan penutup invoice panjang',
			lines: Array.from({ length: N }, (_, i) => ({ description: desc(i + 1), quantity: '1', unitPrice: '1000' }))
		}
	});
	const res = await fetchPdf();
	expect(res.status).toBe(200);
	const { result } = await parse(res);
	expect(result.total).toBeGreaterThan(1);
	for (let i = 1; i <= N; i++) {
		expect(result.pages.filter((p) => p.text.includes(desc(i)))).toHaveLength(1);
	}
	expect(result.pages[0].text).not.toContain(desc(N));
	expect(result.pages[1].text).toContain('Keterangan');
	expect(result.pages[1].text).toContain('Description');
	const approved = result.pages.filter((p) => p.text.includes('Approved by,'));
	expect(approved).toHaveLength(1);
	const lastPage = result.pages[result.pages.length - 1].text;
	expect(lastPage).toContain('Approved by,');
	expect(lastPage).toContain('TERBILANG');
	expect(lastPage).toContain('Catatan penutup invoice panjang');
});

test('a transparent WebP watermark still yields a PDF', async () => {
	const { companyId, signerId, fetchPdf } = await setup({ company: FULL_COMPANY });
	const rgba = new Uint8ClampedArray(4 * 4 * 4);
	for (let i = 0; i < rgba.length; i += 4) rgba.set(i % 8 === 0 ? [200, 30, 30, 255] : [0, 0, 0, 0], i);
	const webp = new Uint8Array(await encodeWebp({ data: rgba, width: 4, height: 4, colorSpace: 'srgb' } as ImageData, { lossless: 1 }));
	await setCompanyAsset(companyId, 'watermark', webp);
	await updateSigner(companyId, signerId, { name: 'Sari Penanda', title: 'Direktur Utama', image: webp });
	const res = await fetchPdf();
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('application/pdf');
	const { text, raw } = await parse(res);
	expect(text).toContain('Approved by,');
	expect(raw).toContain('/SMask');
});

test('corrupted watermark/signature bytes are ignored instead of failing the PDF', async () => {
	const { companyId, signerId, fetchPdf } = await setup({ company: FULL_COMPANY });
	const broken = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
	await setCompanyAsset(companyId, 'watermark', broken);
	await updateSigner(companyId, signerId, { name: 'Sari Penanda', title: 'Direktur Utama', image: broken });
	const res = await fetchPdf();
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('application/pdf');
	const { text } = await parse(res);
	expect(text).toContain('Approved by,');
	expect(text).toContain('Sari Penanda');
});

test('no company context is a 401', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/invoicing/invoices/x/pdf', params: { id: 'x' } }) as never);
	expect(res.status).toBe(401);
});

test('billing summary heading is never orphaned from the table header, even with a very tall header area', async () => {
	// Sweep header heights so one of them lands the heading right at the page bottom.
	for (let n = 14; n <= 40; n += 2) {
		const address = Array.from({ length: n }, (_, i) => `Jalan Panjang Nomor ${i + 1} Kelurahan Uji`).join('\n');
		await resetDb();
		const { fetchPdf } = await setup({ company: { ...FULL_COMPANY, address }, contact: { ...FULL_CONTACT, address } });
		const { result } = await parse(await fetchPdf());
		const page = result.pages.find((p) => p.text.includes('RINCIAN TAGIHAN'));
		expect(page, `n=${n}`).toBeDefined();
		expect(page!.text.includes('Keterangan'), `n=${n}`).toBe(true);
	}
}, 60_000);

test('a very long invoice number is wrapped instead of overflowing the margin', async () => {
	const { fetchPdf } = await setup();
	const no = `001/${'W'.repeat(15)}-${'W'.repeat(15)}/INV/X/2026`;
	await db.update(invoices).set({ invoiceNo: no });
	const { text } = await parse(await fetchPdf());
	expect(text.replace(/\s+/g, '')).toContain(no);
});

test('invoice PDF carries no receipt markings', async () => {
	const { fetchPdf } = await setup({ company: FULL_COMPANY, contact: FULL_CONTACT, invoice: { subject: 'Perihal Uji' } });
	const { text } = await parse(await fetchPdf());
	expect(text.replace(/\s+/g, '')).not.toContain('LUNAS');
	expect(text).not.toContain('PAYMENT RECEIPT');
	expect(text).not.toContain('Acknowledged by');
	expect(text).toContain('Approved by,');
});

test('rich notes: paragraphs, numbered and bullet lists are printed with their markers', async () => {
	const { fetchPdf } = await setup({
		invoice: { notes: '<div>Syarat pembayaran:</div><ol><li>Transfer <b>maksimal</b> 7 hari</li><li>Sertakan nomor invoice</li></ol><ul><li>Denda <i>1%</i></li></ul>' }
	});
	const { text } = await parse(await fetchPdf());
	expect(text).toContain('Syarat pembayaran:');
	expect(text).toContain('1.');
	expect(text).toContain('Transfer maksimal 7 hari');
	expect(text).toContain('2.');
	expect(text).toContain('Sertakan nomor invoice');
	expect(text).toContain('•');
	expect(text).toContain('Denda 1%');
	expect(text).not.toContain('<');
});
