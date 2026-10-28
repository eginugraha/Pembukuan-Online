import { beforeEach, expect, test } from 'bun:test';
import { GET as LIST, POST as CREATE } from '../../src/routes/api/invoicing/quotations/+server';
import { DELETE, GET, PUT } from '../../src/routes/api/invoicing/quotations/[id]/+server';
import { POST as REVISE } from '../../src/routes/api/invoicing/quotations/[id]/revisions/+server';
import { DELETE as UNAPPROVE, POST as APPROVE } from '../../src/routes/api/invoicing/quotations/[id]/approval/+server';
import { GET as PDF } from '../../src/routes/api/invoicing/quotations/[id]/pdf/+server';
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
	const body = { contactId: contact.id, issueDate: '2026-10-01', lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1500000' }] };
	const ev = async (who: typeof acc, method: string, path: string, params: Record<string, string> = {}, payload?: unknown) =>
		fakeEvent({ ctx: await contextFor(who, companyId), method, path, params, body: payload });
	return { acc, viewer, body, ev };
}

test('viewer reads list, detail and PDF but cannot write', async () => {
	const { acc, viewer, body, ev } = await setup();
	const created = await call(CREATE, await ev(acc, 'POST', '/api/invoicing/quotations', {}, body));
	expect(created.status).toBe(201);
	const id = created.body.id as string;
	const p = { id };

	expect((await call(LIST, await ev(viewer, 'GET', '/api/invoicing/quotations'))).body[0].quotationNo).toBe('001/UJI-PLG/QUO/X/2026');
	expect((await call(GET, await ev(viewer, 'GET', `/api/invoicing/quotations/${id}`, p))).status).toBe(200);
	expect((await PDF((await ev(viewer, 'GET', `/api/invoicing/quotations/${id}/pdf`, p)) as never)).status).toBe(200);

	expect((await call(CREATE, await ev(viewer, 'POST', '/api/invoicing/quotations', {}, body))).status).toBe(403);
	expect((await call(PUT, await ev(viewer, 'PUT', `/api/invoicing/quotations/${id}`, p, body))).status).toBe(403);
	expect((await call(DELETE, await ev(viewer, 'DELETE', `/api/invoicing/quotations/${id}`, p))).status).toBe(403);
	expect((await call(REVISE, await ev(viewer, 'POST', `/api/invoicing/quotations/${id}/revisions`, p, body))).status).toBe(403);
	expect((await call(APPROVE, await ev(viewer, 'POST', `/api/invoicing/quotations/${id}/approval`, p))).status).toBe(403);
	expect((await call(UNAPPROVE, await ev(viewer, 'DELETE', `/api/invoicing/quotations/${id}/approval`, p))).status).toBe(403);
});

test('accountant: create, revise, approve blocks edit, unapprove allows it again', async () => {
	const { acc, body, ev } = await setup();
	const { id } = (await call(CREATE, await ev(acc, 'POST', '/api/invoicing/quotations', {}, body))).body;
	const rev = await call(REVISE, await ev(acc, 'POST', `/api/invoicing/quotations/${id}/revisions`, { id }, body));
	expect(rev.status).toBe(201);
	const r1 = rev.body.id as string;
	const p = { id: r1 };
	expect((await call(GET, await ev(acc, 'GET', `/api/invoicing/quotations/${r1}`, p))).body.quotationNo).toBe('001/UJI-PLG/QUO/X/2026-R1');

	expect((await call(APPROVE, await ev(acc, 'POST', `/api/invoicing/quotations/${r1}/approval`, p))).status).toBe(200);
	const blocked = await call(PUT, await ev(acc, 'PUT', `/api/invoicing/quotations/${r1}`, p, body));
	expect(blocked.status).toBe(409);
	expect(blocked.body.code ?? blocked.body.error?.code).toBe('quotation_approved');
	expect((await call(UNAPPROVE, await ev(acc, 'DELETE', `/api/invoicing/quotations/${r1}/approval`, p))).status).toBe(200);
	expect((await call(PUT, await ev(acc, 'PUT', `/api/invoicing/quotations/${r1}`, p, body))).status).toBe(200);
	expect((await call(DELETE, await ev(acc, 'DELETE', `/api/invoicing/quotations/${r1}`, p))).status).toBe(200);
});
