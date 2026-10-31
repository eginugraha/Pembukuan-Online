import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createArAp, type CreateArApInput } from '../../src/lib/server/arap/entries';
import { createInvoice } from '../../src/lib/server/invoicing/invoices';
import { createPurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { db } from '../../src/lib/server/db';
import { arApTerms, invoices, purchaseOrders } from '../../src/lib/server/db/schema';
import { POST as POST_INVOICE } from '../../src/routes/api/invoicing/invoices/+server';
import { POST as POST_PO } from '../../src/routes/api/invoicing/purchase-orders/+server';
import { addMember, contextFor, makeCompany, makeContact, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

const lines = [{ description: 'Jasa', quantity: '2', unitPrice: '500' }];

async function setup() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'accountant');
	const { id: customerId } = await makeContact(companyId, 'CUSTOMER', { name: 'PT Pelanggan', code: 'PLG' });
	const { id: otherCustomerId } = await makeContact(companyId, 'CUSTOMER', { name: 'PT Lain', code: 'LAN' });
	const { id: vendorId } = await makeContact(companyId, 'VENDOR', { name: 'PT Pemasok', code: 'PMS' });
	const entry = async (kind: 'AR' | 'AP', contactId: string) => {
		const input: CreateArApInput = {
			kind,
			contactId,
			title: 'Proyek',
			total: '100000000',
			currency: 'IDR',
			paid: false,
			documentId: null,
			terms: [
				{ name: 'DP', percent: '50', paid: false, documentId: null },
				{ name: 'Pelunasan', percent: '50', paid: false, documentId: null }
			]
		};
		const { id } = await createArAp(companyId, u.id, input);
		const terms = await db.select().from(arApTerms).where(eq(arApTerms.entryId, id)).orderBy(arApTerms.termNo);
		return terms.map((t) => t.id);
	};
	return { companyId, userId: u.id, user: u, customerId, otherCustomerId, vendorId, entry };
}

const termRow = async (id: string) => (await db.select().from(arApTerms).where(eq(arApTerms.id, id)))[0];
const inv = (contactId: string) => ({ contactId, issueDate: '2026-10-01', lines });

test('createInvoice with linkTermId links the AR term even when contact and amount differ', async () => {
	const s = await setup();
	const [t1] = await s.entry('AR', s.customerId);
	const { id } = await createInvoice(s.companyId, s.userId, inv(s.otherCustomerId), { linkTermId: t1 });
	expect((await termRow(t1)).invoiceId).toBe(id);
});

test('already linked term -> 409 term_already_linked and no new invoice row', async () => {
	const s = await setup();
	const [t1] = await s.entry('AR', s.customerId);
	const first = await createInvoice(s.companyId, s.userId, inv(s.customerId), { linkTermId: t1 });
	await expect(createInvoice(s.companyId, s.userId, inv(s.customerId), { linkTermId: t1 })).rejects.toMatchObject({
		status: 409,
		code: 'term_already_linked'
	});
	const rows = await db.select().from(invoices);
	expect(rows.map((r) => r.id)).toEqual([first.id]);
	expect((await termRow(t1)).invoiceId).toBe(first.id);
});

test('term of another company -> 404 and nothing created', async () => {
	const s = await setup();
	const [t1] = await s.entry('AR', s.customerId);
	const other = await setup2();
	await expect(createInvoice(other.companyId, other.userId, inv(other.customerId), { linkTermId: t1 })).rejects.toMatchObject({ status: 404, code: 'not_found' });
	expect(await db.select().from(invoices)).toHaveLength(0);
	expect((await termRow(t1)).invoiceId).toBeNull();
});
async function setup2() {
	const { companyId } = await makeCompany('PT Lain Perusahaan');
	const u = await makeUser();
	const { id: customerId } = await makeContact(companyId, 'CUSTOMER', { code: 'ZZZ' });
	return { companyId, userId: u.id, customerId };
}

test('createPurchaseOrder with linkTermId links the AP term; already linked -> 409 and no new PO', async () => {
	const s = await setup();
	const [t1] = await s.entry('AP', s.vendorId);
	const po = { contactId: s.vendorId, issueDate: '2026-10-01', lines };
	const { id } = await createPurchaseOrder(s.companyId, s.userId, po, { linkTermId: t1 });
	expect((await termRow(t1)).purchaseOrderId).toBe(id);
	await expect(createPurchaseOrder(s.companyId, s.userId, po, { linkTermId: t1 })).rejects.toMatchObject({ status: 409, code: 'term_already_linked' });
	expect(await db.select().from(purchaseOrders)).toHaveLength(1);
});

test('kind mismatch is rejected and leaves no document', async () => {
	const s = await setup();
	const [ap] = await s.entry('AP', s.vendorId);
	const [ar] = await s.entry('AR', s.customerId);
	const termNotFound = { status: 404, code: 'not_found', message: 'Termin tidak ditemukan' };
	await expect(createInvoice(s.companyId, s.userId, inv(s.customerId), { linkTermId: ap })).rejects.toMatchObject(termNotFound);
	await expect(createPurchaseOrder(s.companyId, s.userId, { contactId: s.vendorId, issueDate: '2026-10-01', lines }, { linkTermId: ar })).rejects.toMatchObject(termNotFound);
	expect(await db.select().from(invoices)).toHaveLength(0);
	expect(await db.select().from(purchaseOrders)).toHaveLength(0);
	expect((await termRow(ap)).invoiceId).toBeNull();
	expect((await termRow(ar)).purchaseOrderId).toBeNull();

	// Link gagal membatalkan nomor dokumen: invoice/PO sukses berikutnya tetap bernomor urut 001.
	const okInv = await createInvoice(s.companyId, s.userId, inv(s.customerId), { linkTermId: ar });
	const [invRow] = await db.select().from(invoices).where(eq(invoices.id, okInv.id));
	expect(invRow.invoiceNo.startsWith('001/')).toBe(true);
	const okPo = await createPurchaseOrder(s.companyId, s.userId, { contactId: s.vendorId, issueDate: '2026-10-01', lines }, { linkTermId: ap });
	const [poRow] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, okPo.id));
	expect(poRow.poNo.startsWith('001/')).toBe(true);
});

test('without linkTermId behavior is unchanged', async () => {
	const s = await setup();
	const [t1] = await s.entry('AR', s.customerId);
	await createInvoice(s.companyId, s.userId, inv(s.customerId));
	expect((await termRow(t1)).invoiceId).toBeNull();
});

test('route: invalid termId -> 400, valid termId links (invoice and PO)', async () => {
	const s = await setup();
	const ctx = await contextFor(s.user, s.companyId);
	const ev = (path: string, body: unknown) => fakeEvent({ ctx, method: 'POST', path, body });
	const [ar] = await s.entry('AR', s.customerId);
	const [ap] = await s.entry('AP', s.vendorId);
	const invBody = inv(s.customerId);
	const poBody = { contactId: s.vendorId, issueDate: '2026-10-01', lines };

	const bad = await call(POST_INVOICE, ev('/api/invoicing/invoices?termId=nope', invBody));
	expect(bad.status).toBe(400);
	expect(bad.body.error.code).toBe('validation_error');
	expect(bad.body.error.fields.termId).toBeDefined();
	expect((await call(POST_PO, ev('/api/invoicing/purchase-orders?termId=nope', poBody))).status).toBe(400);
	expect(await db.select().from(invoices)).toHaveLength(0);

	const ok = await call(POST_INVOICE, ev(`/api/invoicing/invoices?termId=${ar}`, invBody));
	expect(ok.status).toBe(201);
	expect((await termRow(ar)).invoiceId).toBe(ok.body.id);
	const okPo = await call(POST_PO, ev(`/api/invoicing/purchase-orders?termId=${ap}`, poBody));
	expect(okPo.status).toBe(201);
	expect((await termRow(ap)).purchaseOrderId).toBe(okPo.body.id);
});
