import { beforeEach, expect, test } from 'bun:test';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/invoicing/invoices/[id]/pdf/+server';
import { createInvoice } from '../../src/lib/server/invoicing/invoices';
import { db } from '../../src/lib/server/db';
import { contacts } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser, addMember, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function textOf(res: Response): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
	return (await parser.getText()).text;
}

test('PDF contains the contact name, invoice number, line description, and total', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Pelanggan Uji', code: 'PLG' }).returning();
	const { id } = await createInvoice(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', lines: [{ description: 'Jasa konsultasi', quantity: '1', unitPrice: '1500000' }] });

	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/invoices/${id}/pdf`, params: { id } }) as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('application/pdf');
	const text = await textOf(res);
	expect(text).toContain('PT Pelanggan Uji');
	expect(text).toContain('001/UJI-PLG/INV/X/2026');
	expect(res.headers.get('content-disposition')).toBe('attachment; filename="invoice-001-UJI-PLG-INV-X-2026.pdf"');
	expect(text).toContain('Jasa konsultasi');
	expect(text).toContain('1.500.000,00');
});

test('PDF Kepada block shows Attn line with attention and position under the company name', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Attn Uji', code: 'PLG', attention: 'Budi Santoso', position: 'Manajer Keuangan' }).returning();
	const { id } = await createInvoice(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000' }] });

	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/invoices/${id}/pdf`, params: { id } }) as never);
	const text = await textOf(res);
	expect(text).toContain('Attn: Budi Santoso, Manajer Keuangan');
	expect(text.indexOf('PT Attn Uji')).toBeLessThan(text.indexOf('Attn: Budi Santoso'));
});

test('a 60-line invoice breaks onto more than one page, keeping every line and the totals on real pages', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Panjang', code: 'PLG' }).returning();
	const N = 60;
	const desc = (i: number) => `Baris ke-${String(i).padStart(2, '0')}`;
	const { id } = await createInvoice(companyId, u.id, {
		contactId: contact.id,
		issueDate: '2026-10-01',
			notes: 'Catatan penutup invoice panjang',
		lines: Array.from({ length: N }, (_, i) => ({ description: desc(i + 1), quantity: '1', unitPrice: '1000' }))
	});

	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/invoices/${id}/pdf`, params: { id } }) as never);
	expect(res.status).toBe(200);
	const result = await new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) }).getText();
	expect(result.total).toBeGreaterThan(1);

	// Every line lands on exactly one page (none lost off the bottom edge, none duplicated).
	for (let i = 1; i <= N; i++) {
		expect(result.pages.filter((p) => p.text.includes(desc(i)))).toHaveLength(1);
	}
	// The first page can't hold all 60 rows, so the last one must be on a later page.
	expect(result.pages[0].text).not.toContain(desc(N));
	// The continuation page repeats the column header.
	expect(result.pages[1].text).toContain('Harga Satuan');
	// Totals and notes land on the final page.
	const lastPage = result.pages[result.pages.length - 1].text;
	expect(lastPage).toContain('60.000,00');
	expect(lastPage).toContain('Catatan penutup invoice panjang');
	expect(lastPage).not.toContain('Status:');
});

test('no company context is a 401', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/invoicing/invoices/x/pdf', params: { id: 'x' } }) as never);
	expect(res.status).toBe(401);
});
