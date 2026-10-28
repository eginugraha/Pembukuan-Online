import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createContact, deleteContact } from '../../src/lib/server/invoicing/contacts';
import {
	approveQuotation,
	createQuotation,
	deleteQuotation,
	getQuotation,
	listQuotations,
	reviseQuotation,
	unapproveQuotation,
	updateQuotation
} from '../../src/lib/server/invoicing/quotations';
import { createSigner } from '../../src/lib/server/company/signers';
import { db } from '../../src/lib/server/db';
import { journalEntries, quotations } from '../../src/lib/server/db/schema';
import { makeCompany, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id: contactId } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Pelanggan', code: 'PLG' });
	return { companyId, userId: u.id, contactId };
}
const line = (description: string, quantity = '1', unitPrice = '1000000') => ({ description, quantity, unitPrice });
const input = (contactId: string, extra: Record<string, unknown> = {}) => ({ contactId, issueDate: '2026-10-01', lines: [line('Jasa')], ...extra });
const LOCKED = { status: 409, code: 'quotation_locked' };
const APPROVED = { status: 409, code: 'quotation_approved' };

test('create numbers as 001/UJI-PLG/QUO/X/2026, computes totals, status pending, and writes no journal', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createQuotation(companyId, userId, input(contactId, { taxRate: '11', discount: '100000' }));
	const q = await getQuotation(companyId, id);
	expect(q).toMatchObject({ quotationNo: '001/UJI-PLG/QUO/X/2026', revision: 0, isLatest: true, status: 'pending', subtotal: '1000000.00', discount: '100000.00', taxAmount: '99000.00', total: '999000.00' });
	expect(await db.select().from(journalEntries).where(eq(journalEntries.companyId, companyId))).toHaveLength(0);
});

test('revise creates -R1 with copied signer, old version becomes revised and read-only', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id: r0 } = await createQuotation(companyId, userId, input(contactId));
	const signerId = await createSigner(companyId, { name: 'Sari', title: 'Direktur' });
	await db.update(quotations).set({ lastSignerId: signerId }).where(eq(quotations.id, r0));
	const { id: r1 } = await reviseQuotation(companyId, userId, r0, input(contactId, { issueDate: '2026-11-03', lines: [line('Jasa', '1', '900000')] }));

	const latest = await getQuotation(companyId, r1);
	// Nomor dasar tetap dari versi pertama walau tanggal revisi di bulan lain.
	expect(latest).toMatchObject({ quotationNo: '001/UJI-PLG/QUO/X/2026-R1', revision: 1, lastSignerId: signerId, total: '900000.00', status: 'pending' });
	const old = await getQuotation(companyId, r0);
	expect(old).toMatchObject({ isLatest: false, status: 'revised' });

	await expect(updateQuotation(companyId, r0, input(contactId))).rejects.toMatchObject(LOCKED);
	await expect(reviseQuotation(companyId, userId, r0, input(contactId))).rejects.toMatchObject(LOCKED);
	await expect(approveQuotation(companyId, userId, r0)).rejects.toMatchObject(LOCKED);
	await expect(deleteQuotation(companyId, r0)).rejects.toMatchObject(LOCKED);
});

test('concurrent revise of the same version: exactly one succeeds', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createQuotation(companyId, userId, input(contactId));
	const results = await Promise.allSettled([reviseQuotation(companyId, userId, id, input(contactId)), reviseQuotation(companyId, userId, id, input(contactId))]);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
	expect(rejected.reason).toMatchObject(LOCKED);
	expect((await listQuotations(companyId)).map((q) => q.quotationNo)).toEqual(['001/UJI-PLG/QUO/X/2026-R1']);
});

test('deleting R1 restores R0 as latest and the next revision is R2', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id: r0 } = await createQuotation(companyId, userId, input(contactId));
	const { id: r1 } = await reviseQuotation(companyId, userId, r0, input(contactId));
	await deleteQuotation(companyId, r1);
	expect(await getQuotation(companyId, r0)).toMatchObject({ isLatest: true, status: 'pending' });
	await expect(getQuotation(companyId, r1)).rejects.toMatchObject({ status: 404 });
	const { id: r2 } = await reviseQuotation(companyId, userId, r0, input(contactId));
	expect((await getQuotation(companyId, r2)).quotationNo).toBe('001/UJI-PLG/QUO/X/2026-R2');
});

test('deleting R0 while R1 exists is rejected with quotation_locked', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id: r0 } = await createQuotation(companyId, userId, input(contactId));
	await reviseQuotation(companyId, userId, r0, input(contactId));
	await expect(deleteQuotation(companyId, r0)).rejects.toMatchObject(LOCKED);
});

test('deleting the only version removes it from the list; the base number is not reused', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createQuotation(companyId, userId, input(contactId));
	await deleteQuotation(companyId, id);
	expect(await listQuotations(companyId)).toHaveLength(0);
	const { id: next } = await createQuotation(companyId, userId, input(contactId));
	expect((await getQuotation(companyId, next)).quotationNo).toBe('002/UJI-PLG/QUO/X/2026');
});

test('expired quotation can be approved directly; approved blocks update/revise/delete; unapprove re-enables them', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createQuotation(companyId, userId, input(contactId, { validUntil: '2026-10-05' }));
	expect((await getQuotation(companyId, id)).status).toBe('expired');
	await approveQuotation(companyId, userId, id);
	expect(await getQuotation(companyId, id)).toMatchObject({ status: 'approved' });
	expect((await getQuotation(companyId, id)).approvedAt).toBeInstanceOf(Date);

	await expect(updateQuotation(companyId, id, input(contactId))).rejects.toMatchObject(APPROVED);
	await expect(reviseQuotation(companyId, userId, id, input(contactId))).rejects.toMatchObject(APPROVED);
	await expect(deleteQuotation(companyId, id)).rejects.toMatchObject(APPROVED);

	await unapproveQuotation(companyId, id);
	expect((await getQuotation(companyId, id)).status).toBe('expired');
	await updateQuotation(companyId, id, input(contactId, { validUntil: '2099-01-01' }));
	expect((await getQuotation(companyId, id)).status).toBe('pending');
});

test('update and revise reject a different contact with contact_locked; same contact works after it is soft-deleted', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id: other } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Lain', code: 'LAN' });
	const { id } = await createQuotation(companyId, userId, input(contactId));
	const locked = { status: 422, code: 'contact_locked' };
	await expect(updateQuotation(companyId, id, input(other))).rejects.toMatchObject(locked);
	await expect(reviseQuotation(companyId, userId, id, input(other))).rejects.toMatchObject(locked);

	await deleteContact(companyId, contactId);
	await updateQuotation(companyId, id, input(contactId, { notes: 'tetap boleh' }));
	const { id: r1 } = await reviseQuotation(companyId, userId, id, input(contactId));
	expect((await getQuotation(companyId, r1)).contactId).toBe(contactId);
});

test('update keeps the number even when the date moves to another month', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id } = await createQuotation(companyId, userId, input(contactId));
	await updateQuotation(companyId, id, input(contactId, { issueDate: '2027-02-01' }));
	expect(await getQuotation(companyId, id)).toMatchObject({ quotationNo: '001/UJI-PLG/QUO/X/2026', issueDate: '2027-02-01' });
});

test('list shows only the latest version per number with its status', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id: a0 } = await createQuotation(companyId, userId, input(contactId));
	await reviseQuotation(companyId, userId, a0, input(contactId));
	const { id: b } = await createQuotation(companyId, userId, input(contactId, { issueDate: '2026-10-02' }));
	await approveQuotation(companyId, userId, b);
	const list = await listQuotations(companyId);
	expect(list.map((q) => [q.quotationNo, q.status, q.contactName])).toEqual([
		['001/UJI-PLG/QUO/X/2026-R1', 'pending', 'PT Pelanggan'],
		['002/UJI-PLG/QUO/X/2026', 'approved', 'PT Pelanggan']
	]);
});

test('getQuotation history lists versions newest first', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id: r0 } = await createQuotation(companyId, userId, input(contactId));
	const { id: r1 } = await reviseQuotation(companyId, userId, r0, input(contactId));
	const { id: r2 } = await reviseQuotation(companyId, userId, r1, input(contactId));
	const h = (await getQuotation(companyId, r0)).history;
	expect(h.map((v) => [v.id, v.quotationNo, v.status])).toEqual([
		[r2, '001/UJI-PLG/QUO/X/2026-R2', 'pending'],
		[r1, '001/UJI-PLG/QUO/X/2026-R1', 'revised'],
		[r0, '001/UJI-PLG/QUO/X/2026', 'revised']
	]);
});

test('another company cannot read or change it', async () => {
	const { companyId, userId, contactId } = await setup();
	const other = await makeCompany('PT Lain');
	const { id } = await createQuotation(companyId, userId, input(contactId));
	await expect(getQuotation(other.companyId, id)).rejects.toMatchObject({ status: 404 });
	await expect(updateQuotation(other.companyId, id, input(contactId))).rejects.toMatchObject({ status: 404 });
	await expect(approveQuotation(other.companyId, userId, id)).rejects.toMatchObject({ status: 404 });
	await expect(deleteQuotation(other.companyId, id)).rejects.toMatchObject({ status: 404 });
});

test('history rows carry their own currency when a revision changes it', async () => {
	const { companyId, userId, contactId } = await setup();
	const { id: r0 } = await createQuotation(companyId, userId, input(contactId));
	const { id: r1 } = await reviseQuotation(companyId, userId, r0, input(contactId, { currency: 'USD' }));
	const h = (await getQuotation(companyId, r1)).history;
	expect(h.map((v) => [v.quotationNo, v.currency])).toEqual([
		['001/UJI-PLG/QUO/X/2026-R1', 'USD'],
		['001/UJI-PLG/QUO/X/2026', 'IDR']
	]);
});
