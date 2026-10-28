import { beforeEach, expect, test } from 'bun:test';
import { createSigner } from '../../src/lib/server/company/signers';
import { eq } from 'drizzle-orm';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/invoicing/invoices/[id]/receipt/pdf/+server';
import { createInvoice, updateInvoice, type CreateInvoiceInput } from '../../src/lib/server/invoicing/invoices';
import { updateContact } from '../../src/lib/server/invoicing/contacts';
import { deletePaymentReceipt, issuePaymentReceipt } from '../../src/lib/server/invoicing/payment-receipts';
import { db } from '../../src/lib/server/db';
import { companies, contacts } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser, addMember, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function parse(res: Response) {
	const bytes = new Uint8Array(await res.arrayBuffer());
	const result = await new PDFParse({ data: bytes }).getText();
	return { result, text: result.text, flat: result.text.replace(/\s+/g, ' '), bare: result.text.replace(/\s+/g, '') };
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

async function setup(
	opts: { company?: Partial<typeof FULL_COMPANY>; contact?: Partial<typeof FULL_CONTACT>; invoice?: Partial<CreateInvoiceInput>; issue?: boolean } = {}
) {
	const { companyId } = await makeCompany();
	if (opts.company) await db.update(companies).set(opts.company).where(eq(companies.id, companyId));
	if (opts.company) await createSigner(companyId, { name: 'Sari Penanda', title: 'Direktur Utama' });
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const [contact] = await db
		.insert(contacts)
		.values({ companyId, kind: 'CUSTOMER', name: 'PT Pelanggan Uji', code: 'PLG', ...opts.contact })
		.returning();
	const { id } = await createInvoice(companyId, u.id, {
		contactId: contact.id,
		issueDate: '2026-10-01',
		dueDate: '2026-10-08',
		lines: [{ description: 'Jasa konsultasi', quantity: '1', unitPrice: '1500000' }],
		...opts.invoice
	});
	if (opts.issue !== false) await issuePaymentReceipt(companyId, u.id, id, { paymentDate: '2026-04-15' });
	const fetchPdf = async () =>
		GET(fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/invoices/${id}/receipt/pdf`, params: { id } }) as never);
	return { companyId, userId: u.id, contactId: contact.id, invoiceId: id, fetchPdf };
}

const PARAGRAPH = (what: string) =>
	`Dokumen ini merupakan bukti pembayaran atas pembelian ${what}. Kuitansi ini diterbitkan sebagai bukti penerimaan pembayaran atas transaksi tersebut.`;

test('full receipt: receipt header, paragraph, Acknowledged by and LUNAS; no payment card or due date', async () => {
	const { fetchPdf } = await setup({
		company: FULL_COMPANY,
		contact: FULL_CONTACT,
		invoice: { subject: 'Pengembangan Website Portal', notes: 'Terima kasih atas pembayaran Anda.' }
	});
	const res = await fetchPdf();
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('application/pdf');
	expect(res.headers.get('content-disposition')).toBe('attachment; filename="receipt-001-UJI-PLG-RCP-IV-2026.pdf"');
	const { text, flat, bare } = await parse(res);
	for (const s of [
		'PAYMENT RECEIPT',
		'Kuitansi Pembayaran',
		'Nomor Kuitansi / Receipt Number',
		'001/UJI-PLG/RCP/IV/2026',
		'Tanggal Pembayaran / Payment Date',
		'15 April 2026',
		'Nomor Invoice / Invoice Number',
		'001/UJI-PLG/INV/X/2026',
		'PERIHAL / SUBJECT',
		'DITAGIHKAN KEPADA / BILL TO',
		'Attn: Budi Santoso, Manajer Keuangan',
		'NPWP 01.234.567.8-901.000',
		'RINCIAN TAGIHAN',
		'Jasa konsultasi',
		'1.500.000',
		'TERBILANG / Amount in Words',
		'Satu Juta Lima Ratus Ribu Rupiah',
		'Terima kasih atas pembayaran Anda.',
		'Acknowledged by,',
		'Sari Penanda',
		'Direktur Utama'
	]) {
		expect(text).toContain(s);
	}
	expect(flat).toContain(PARAGRAPH('Pengembangan Website Portal'));
	expect(bare).toContain('LUNAS');
	// Paragraf tepat setelah terbilang, sebelum catatan dan tanda tangan.
	expect(flat.indexOf('Satu Juta Lima Ratus Ribu Rupiah')).toBeLessThan(flat.indexOf('Dokumen ini merupakan'));
	expect(flat.indexOf('Dokumen ini merupakan')).toBeLessThan(flat.indexOf('Terima kasih atas pembayaran Anda.'));
	expect(flat.indexOf('Terima kasih atas pembayaran Anda.')).toBeLessThan(flat.indexOf('Acknowledged by,'));
	for (const s of ['INFORMASI PEMBAYARAN', 'Approved by', 'Jatuh Tempo', 'BCA', 'Tagihan']) {
		expect(text).not.toContain(s);
	}
	expect(text).not.toMatch(/\bINVOICE\b/);
});

test('without a subject the paragraph refers to the invoice number', async () => {
	const { fetchPdf } = await setup();
	const { flat } = await parse(await fetchPdf());
	expect(flat).toContain(PARAGRAPH('pada Invoice 001/UJI-PLG/INV/X/2026'));
	expect(flat).not.toContain('PERIHAL');
});

test('USD receipt prints dollar amounts and dollar terbilang', async () => {
	const { fetchPdf } = await setup({ invoice: { currency: 'USD', lines: [{ description: 'Consulting', quantity: '1', unitPrice: '1250' }] } });
	const { text } = await parse(await fetchPdf());
	expect(text).toContain('$1,250.00');
	expect(text).toContain('Seribu Dua Ratus Lima Puluh Dolar Amerika Serikat');
	expect(text).not.toContain('Rupiah');
});

test('a 60-line receipt: LUNAS on every page, each line once, header repeated, signature once on the last page', async () => {
	const N = 60;
	const desc = (i: number) => `Baris ke-${String(i).padStart(2, '0')}`;
	const { fetchPdf } = await setup({
		company: FULL_COMPANY,
		invoice: { lines: Array.from({ length: N }, (_, i) => ({ description: desc(i + 1), quantity: '1', unitPrice: '1000' })) }
	});
	const { result } = await parse(await fetchPdf());
	expect(result.total).toBeGreaterThan(1);
	for (const p of result.pages) expect(p.text.replace(/\s+/g, '')).toContain('LUNAS');
	for (let i = 1; i <= N; i++) {
		expect(result.pages.filter((p) => p.text.includes(desc(i)))).toHaveLength(1);
	}
	expect(result.pages[1].text).toContain('Keterangan');
	expect(result.pages[1].text).toContain('Description');
	const ack = result.pages.filter((p) => p.text.includes('Acknowledged by,'));
	expect(ack).toHaveLength(1);
	const last = result.pages[result.pages.length - 1].text;
	expect(last).toContain('Acknowledged by,');
	expect(last).toContain('TERBILANG');
});

test('the receipt is a snapshot: later invoice and contact edits do not change it', async () => {
	const { companyId, contactId, invoiceId, fetchPdf } = await setup({ contact: FULL_CONTACT, invoice: { subject: 'Perihal Lama' } });
	await updateInvoice(companyId, invoiceId, {
		contactId,
		issueDate: '2026-10-01',
		subject: 'Perihal Baru',
		currency: 'IDR',
		lines: [{ description: 'Baris baru', quantity: '3', unitPrice: '2000000' }]
	});
	await updateContact(companyId, contactId, { name: 'PT Nama Baru', address: 'Alamat Baru' });
	const { text, flat } = await parse(await fetchPdf());
	expect(text).toContain('Perihal Lama');
	expect(text).toContain('Jasa konsultasi');
	expect(text).toContain('1.500.000');
	expect(text).toContain('PT Pelanggan Uji');
	expect(text).toContain('Denpasar, Indonesia');
	expect(flat).toContain(PARAGRAPH('Perihal Lama'));
	for (const s of ['Perihal Baru', 'Baris baru', '6.000.000', 'PT Nama Baru', 'Alamat Baru']) expect(text).not.toContain(s);
});

test('no active receipt is a 404, also after the receipt is deleted', async () => {
	const { fetchPdf } = await setup({ issue: false });
	expect((await fetchPdf()).status).toBe(404);

	await resetDb();
	const s = await setup();
	await deletePaymentReceipt(s.companyId, s.invoiceId);
	expect((await s.fetchPdf()).status).toBe(404);
});

test('no company context is a 401, a non-member gets no PDF', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/invoicing/invoices/x/receipt/pdf', params: { id: 'x' } }) as never);
	expect(res.status).toBe(401);

	const { companyId, invoiceId } = await setup();
	const outsider = await makeUser({ email: 'luar@uji.test' });
	const res2 = await GET(
		fakeEvent({ ctx: await contextFor(outsider, companyId), path: `/api/invoicing/invoices/${invoiceId}/receipt/pdf`, params: { id: invoiceId } }) as never
	);
	// Bukan anggota: konteksnya tanpa perusahaan aktif, `requireRole` menolak dengan 409 `no_company` (sama dengan rute PDF invoice).
	expect(res2.status).toBe(409);
	expect(await res2.text()).not.toContain('%PDF');
});
