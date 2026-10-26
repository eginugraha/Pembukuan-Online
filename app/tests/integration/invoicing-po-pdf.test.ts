import { beforeEach, expect, test } from 'bun:test';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/invoicing/purchase-orders/[id]/pdf/+server';
import { createPurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
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
	expect(text).toContain('2.000.000,00');
});

test('no company context is a 401', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/invoicing/purchase-orders/x/pdf', params: { id: 'x' } }) as never);
	expect(res.status).toBe(401);
});
