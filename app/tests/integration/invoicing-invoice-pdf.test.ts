import { beforeEach, expect, test } from 'bun:test';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/invoicing/invoices/[id]/pdf/+server';
import { createInvoice, sendInvoice } from '../../src/lib/server/invoicing/invoices';
import { db } from '../../src/lib/server/db';
import { contacts } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser, accountIdByCode, addMember, contextFor } from './factory';
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
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Pelanggan Uji' }).returning();
	const receivable = await accountIdByCode(companyId, '1-1003');
	const revenue = await accountIdByCode(companyId, '4-1001');
	const { id } = await createInvoice(companyId, u.id, { contactId: contact.id, issueDate: '2026-10-01', receivableAccountId: receivable, lines: [{ description: 'Jasa konsultasi', quantity: '1', unitPrice: '1500000', revenueAccountId: revenue }] });
	await sendInvoice(companyId, u.id, id, '2026-10-01');

	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/invoices/${id}/pdf`, params: { id } }) as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('application/pdf');
	const text = await textOf(res);
	expect(text).toContain('PT Pelanggan Uji');
	expect(text).toContain('INV-2026-0001');
	expect(text).toContain('Jasa konsultasi');
	expect(text).toContain('1.500.000,00');
});

test('no company context is a 401', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/invoicing/invoices/x/pdf', params: { id: 'x' } }) as never);
	expect(res.status).toBe(401);
});
