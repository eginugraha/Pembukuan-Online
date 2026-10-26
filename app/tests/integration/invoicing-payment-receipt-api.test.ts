import { beforeEach, expect, test } from 'bun:test';
import { DELETE, GET, POST } from '../../src/routes/api/invoicing/invoices/[id]/receipt/+server';
import { createInvoice } from '../../src/lib/server/invoicing/invoices';
import { db } from '../../src/lib/server/db';
import { contacts } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser, addMember, contextFor } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId } = await makeCompany();
	const acc = await makeUser();
	await addMember(acc.id, companyId, 'accountant');
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT Pelanggan Uji', code: 'PLG' }).returning();
	const { id } = await createInvoice(companyId, acc.id, {
		contactId: contact.id,
		issueDate: '2026-10-01',
		lines: [{ description: 'Jasa konsultasi', quantity: '1', unitPrice: '1500000' }]
	});
	const ev = async (who: typeof acc | null, method: string, body?: unknown) =>
		fakeEvent({
			ctx: who ? await contextFor(who, companyId) : null,
			method,
			path: `/api/invoicing/invoices/${id}/receipt`,
			params: { id },
			body
		});
	return { acc, viewer, ev };
}

test('accountant issues a receipt, viewer can read it but not write', async () => {
	const { acc, viewer, ev } = await setup();
	const created = await call(POST, await ev(acc, 'POST', { paymentDate: '2026-04-15' }));
	expect(created.status).toBe(201);
	expect(typeof created.body.id).toBe('string');

	const got = await call(GET, await ev(viewer, 'GET'));
	expect(got.status).toBe(200);
	expect(got.body.id).toBe(created.body.id);
	expect(got.body.receiptNo).toMatch(/^001\/UJI-PLG\/RCP\/IV\/2026$/);

	expect((await call(POST, await ev(viewer, 'POST', { paymentDate: '2026-04-15' }))).status).toBe(403);
	expect((await call(DELETE, await ev(viewer, 'DELETE'))).status).toBe(403);
});

test('unauthenticated requests get 401', async () => {
	const { ev } = await setup();
	expect((await call(GET, await ev(null, 'GET'))).status).toBe(401);
	expect((await call(POST, await ev(null, 'POST', { paymentDate: '2026-04-15' }))).status).toBe(401);
	expect((await call(DELETE, await ev(null, 'DELETE'))).status).toBe(401);
});

test('missing or invalid paymentDate gives 400', async () => {
	const { acc, ev } = await setup();
	expect((await call(POST, await ev(acc, 'POST', {}))).status).toBe(400);
	expect((await call(POST, await ev(acc, 'POST', { paymentDate: '' }))).status).toBe(400);
	expect((await call(POST, await ev(acc, 'POST', { paymentDate: 'bukan-tanggal' }))).status).toBe(400);
});

test('second POST gives 409, DELETE then GET gives 404', async () => {
	const { acc, ev } = await setup();
	expect((await call(POST, await ev(acc, 'POST', { paymentDate: '2026-04-15' }))).status).toBe(201);
	const dup = await call(POST, await ev(acc, 'POST', { paymentDate: '2026-04-16' }));
	expect(dup.status).toBe(409);
	expect(dup.body.code ?? dup.body.error?.code).toBe('receipt_exists');

	const del = await call(DELETE, await ev(acc, 'DELETE'));
	expect(del.status).toBe(200);
	expect(del.body).toEqual({ ok: true });
	expect((await call(GET, await ev(acc, 'GET'))).status).toBe(404);
});
