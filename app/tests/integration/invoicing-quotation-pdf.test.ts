import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/invoicing/quotations/[id]/pdf/+server';
import { createQuotation, getQuotation, reviseQuotation } from '../../src/lib/server/invoicing/quotations';
import { createSigner } from '../../src/lib/server/company/signers';
import { db } from '../../src/lib/server/db';
import { companies, contacts } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser, addMember, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function textOf(res: Response): Promise<string> {
	return (await new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) }).getText()).text;
}

async function setup(extra: Record<string, unknown> = {}) {
	const { companyId } = await makeCompany();
	// Rekening diisi: kartu pembayaran tetap tidak boleh tercetak di penawaran.
	await db.update(companies).set({ bankName: 'BCA', bankAccountNo: '233-0636800', bankAccountHolder: 'PT Uji' }).where(eq(companies.id, companyId));
	const u = await makeUser();
	await addMember(u.id, companyId, 'accountant');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Pelanggan Uji', code: 'PLG' }).returning();
	const input = { contactId: contact.id, issueDate: '2026-10-01', notes: '<div>Syarat: <b>DP 30%</b></div>', lines: [{ description: 'Desain UI', quantity: '1', unitPrice: '15000000' }], ...extra };
	const { id: r0 } = await createQuotation(companyId, u.id, input);
	const { id } = await reviseQuotation(companyId, u.id, r0, input);
	const fetchPdf = async (query = '') =>
		GET(fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/quotations/${id}/pdf${query}`, params: { id } }) as never);
	return { companyId, id, fetchPdf };
}

test('prints PENAWARAN / Quotation, number with -R1, Valid Until, QUOTED TO, Quotation Details, notes, and no payment information', async () => {
	const { fetchPdf } = await setup({ validUntil: '2026-10-15' });
	const res = await fetchPdf();
	expect(res.status).toBe(200);
	expect(res.headers.get('content-disposition')).toBe('attachment; filename="quotation-001-UJI-PLG-QUO-X-2026-R1.pdf"');
	const text = await textOf(res);
	for (const s of ['PENAWARAN', 'Quotation', '001/UJI-PLG/QUO/X/2026-R1', 'Berlaku Sampai / Valid Until', '15 Oktober 2026', 'DITAWARKAN KEPADA / QUOTED TO', 'PT Pelanggan Uji', 'RINCIAN PENAWARAN', 'Desain UI', 'Syarat: DP 30%']) {
		expect(text).toContain(s);
	}
	expect(text).not.toContain('INFORMASI PEMBAYARAN');
	expect(text).not.toContain('233-0636800');
});

test('omits Valid Until when empty', async () => {
	const { fetchPdf } = await setup();
	expect(await textOf(await fetchPdf())).not.toContain('Valid Until');
});

test('?signer= is remembered as lastSignerId', async () => {
	const { companyId, id, fetchPdf } = await setup();
	const signerId = await createSigner(companyId, { name: 'Sari Penanda', title: 'Direktur' });
	const text = await textOf(await fetchPdf(`?signer=${signerId}`));
	expect(text).toContain('Sari Penanda');
	expect((await getQuotation(companyId, id)).lastSignerId).toBe(signerId);
});
