import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { PDFParse } from 'pdf-parse';
import { db } from '../../src/lib/server/db';
import { invoices } from '../../src/lib/server/db/schema';
import { createSigner, deleteSigner, listSigners, resolveSignerId, updateSigner } from '../../src/lib/server/company/signers';
import { createInvoice } from '../../src/lib/server/invoicing/invoices';
import { GET as getPdf } from '../../src/routes/api/invoicing/invoices/[id]/pdf/+server';
import { GET as listApi, POST } from '../../src/routes/api/signers/+server';
import { addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { contacts } from '../../src/lib/server/db/schema';
import { resetDb } from './db';

beforeEach(resetDb);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('signers are listed in creation order and carry no image bytes', async () => {
	const { companyId } = await makeCompany();
	await createSigner(companyId, { name: 'Ani', title: 'Direktur', image: PNG });
	await createSigner(companyId, { name: 'Budi', title: null });
	const list = await listSigners(companyId);
	expect(list.map((s) => [s.name, s.title, s.hasImage])).toEqual([
		['Ani', 'Direktur', true],
		['Budi', null, false]
	]);
	expect('content' in list[0]).toBe(false);
});

test('validation: name required, image must be a small PNG/JPG/WebP', async () => {
	const { companyId } = await makeCompany();
	expect(await codeOf(createSigner(companyId, { name: '  ', title: null }))).toBe('validation_error');
	expect(await codeOf(createSigner(companyId, { name: 'A', title: null, image: new TextEncoder().encode('hi') }))).toBe('invalid_image');
	expect(await codeOf(createSigner(companyId, { name: 'A', title: null, image: new Uint8Array(512 * 1024 + 1).fill(1) }))).toBe('image_too_large');
});

test('update keeps the image unless told otherwise; null removes it; other companies cannot touch it', async () => {
	const { companyId } = await makeCompany();
	const other = await makeCompany();
	const id = await createSigner(companyId, { name: 'Ani', title: null, image: PNG });
	await updateSigner(companyId, id, { name: 'Ani B', title: 'CFO' });
	expect((await listSigners(companyId))[0]).toMatchObject({ name: 'Ani B', title: 'CFO', hasImage: true });
	await updateSigner(companyId, id, { name: 'Ani B', title: 'CFO', image: null });
	expect((await listSigners(companyId))[0].hasImage).toBe(false);
	expect(await codeOf(updateSigner(other.companyId, id, { name: 'X', title: null }))).toBe('not_found');
	expect(await codeOf(deleteSigner(other.companyId, id))).toBe('not_found');
});

test('resolveSignerId: explicit choice, else last used, else first, else null', async () => {
	const { companyId } = await makeCompany();
	expect(await resolveSignerId(companyId, null, null)).toBeNull();
	const a = await createSigner(companyId, { name: 'Ani', title: null });
	const b = await createSigner(companyId, { name: 'Budi', title: null });
	expect(await resolveSignerId(companyId, null, null)).toBe(a);
	expect(await resolveSignerId(companyId, null, b)).toBe(b);
	expect(await resolveSignerId(companyId, b, a)).toBe(b);
	await deleteSigner(companyId, b);
	expect(await resolveSignerId(companyId, null, b)).toBe(a);
});

test('invoice PDF uses the chosen signer, remembers it, and falls back to it next time', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const a = await createSigner(companyId, { name: 'Ani Pertama', title: null });
	const b = await createSigner(companyId, { name: 'Budi Kedua', title: null });
	const [contact] = await db.insert(contacts).values({ companyId, kind: 'CUSTOMER', name: 'PT P', code: 'PLG' }).returning();
	const { id } = await createInvoice(companyId, u.id, {
		contactId: contact.id,
		issueDate: '2026-10-01',
		lines: [{ description: 'Jasa', quantity: '1', unitPrice: '1000' }]
	});
	const text = async (signer?: string) => {
		const res = await getPdf(
			fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/invoices/${id}/pdf${signer ? `?signer=${signer}` : ''}`, params: { id } }) as never
		);
		expect(res.status).toBe(200);
		return (await new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) }).getText()).text;
	};
	expect(await text()).toContain('Ani Pertama'); // default: first
	expect(await text(b)).toContain('Budi Kedua');
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.lastSignerId).toBe(b);
	expect(await text()).toContain('Budi Kedua'); // remembered
	await deleteSigner(companyId, b);
	expect((await db.query.invoices.findFirst({ where: eq(invoices.id, id) }))?.lastSignerId).toBeNull();
	expect(await text()).toContain('Ani Pertama');
	const unknown = await getPdf(
		fakeEvent({ ctx: await contextFor(u, companyId), path: `/api/invoicing/invoices/${id}/pdf?signer=${crypto.randomUUID()}`, params: { id } }) as never
	);
	expect(unknown.status).toBe(404);
	expect(a).toBeTruthy();
});

test('API: viewers can list but only admins can create', async () => {
	const { companyId } = await makeCompany();
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const admin = await makeUser();
	await addMember(admin.id, companyId, 'admin');
	const f = () => {
		const body = new FormData();
		body.set('name', 'Ani');
		body.set('title', 'Direktur');
		return body;
	};
	expect((await call(POST, fakeEvent({ ctx: await contextFor(viewer, companyId), method: 'POST', form: f() }))).status).toBe(403);
	expect((await call(POST, fakeEvent({ ctx: await contextFor(admin, companyId), method: 'POST', form: f() }))).status).toBe(201);
	const res = await call(listApi, fakeEvent({ ctx: await contextFor(viewer, companyId) }));
	expect(res.status).toBe(200);
	expect(res.body.signers).toHaveLength(1);
});
