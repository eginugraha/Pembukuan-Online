import { beforeEach, expect, test } from 'bun:test';
import { createSigner } from '../../src/lib/server/company/signers';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/invoicing/purchase-orders/[id]/pdf/+server';
import { createPurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { db } from '../../src/lib/server/db';
import { companies, contacts } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { makeCompany, makeUser, addMember, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function textOf(res: Response): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
	return (await parser.getText()).text;
}

test('PDF contains the vendor name, PO number, line description, and total', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'VENDOR', name: 'PT Pemasok Uji', code: 'PLG' }).returning();
	const { id } = await createPurchaseOrder(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', lines: [{ description: 'Sewa server', quantity: '1', unitPrice: '2000000' }] });

	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/purchase-orders/${id}/pdf`, params: { id } }) as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('application/pdf');
	const text = await textOf(res);
	expect(text).toContain('PT Pemasok Uji');
	expect(text).toContain('001/UJI-PLG/PO/X/2026');
	expect(res.headers.get('content-disposition')).toBe('attachment; filename="po-001-UJI-PLG-PO-X-2026.pdf"');
	expect(text).toContain('Sewa server');
	expect(text).toContain('Rp 2.000.000');
	expect(text).toContain('PURCHASE ORDER');
});

test('full PO in USD: invoice layout with PO labels, no payment card or discount', async () => {
	const { companyId } = await makeCompany();
	await db
		.update(companies)
		.set({ bankName: 'BCA', bankAccountNo: '233-0636800', bankAccountHolder: 'PT Uji' })
		.where(eq(companies.id, companyId));
	await createSigner(companyId, { name: 'Sari Penanda', title: 'Direktur Utama' });
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const [contact] = await db
		.insert(contacts)
		.values({ companyId, kind: 'VENDOR', name: 'PT Pemasok Uji', code: 'PLG', attention: 'Budi', npwp: '01.234.567.8-901.000' })
		.returning();
	const { id } = await createPurchaseOrder(companyId, u.id, {
		contactId: contact.id,
		issueDate: '2026-10-01',
		expectedDate: '2026-10-20',
		subject: 'Pengadaan Server Baru',
		currency: 'USD',
		notes: 'Kirim ke gudang utama.',
		lines: [{ description: 'Sewa server', quantity: '2', unitPrice: '1250' }]
	});

	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/purchase-orders/${id}/pdf`, params: { id } }) as never);
	expect(res.status).toBe(200);
	const text = await textOf(res);
	const flat = text.replace(/\s+/g, ' ');
	expect(flat).toContain('PURCHASE ORDER');
	expect(flat).toContain('Nomor PO');
	expect(flat).toContain('Perkiraan Tiba');
	expect(flat).toContain('20 Oktober 2026');
	expect(flat).toContain('Pengadaan Server Baru');
	expect(flat).toContain('DIPESAN KEPADA');
	expect(flat).toContain('NPWP 01.234.567.8-901.000');
	expect(flat).toContain('Harga (USD)');
	expect(flat).toContain('$2,500.00');
	expect(flat).toContain('Authorized by,');
	expect(flat).toContain('Sari Penanda');
	expect(flat).toContain('Kirim ke gudang utama.');
	expect(flat).not.toContain('INFORMASI PEMBAYARAN');
	expect(flat).not.toContain('Diskon');
	expect(flat).not.toContain('LUNAS');
});

test('no company context is a 401', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/invoicing/purchase-orders/x/pdf', params: { id: 'x' } }) as never);
	expect(res.status).toBe(401);
});
