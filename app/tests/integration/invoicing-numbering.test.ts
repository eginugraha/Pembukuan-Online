import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { companies, contacts, documentNumberCounters } from '../../src/lib/server/db/schema';
import { nextDocumentNumber } from '../../src/lib/server/invoicing/numbering';
import { createInvoice, getInvoice, updateInvoice } from '../../src/lib/server/invoicing/invoices';
import { createPurchaseOrder, getPurchaseOrder } from '../../src/lib/server/invoicing/purchase-orders';
import { makeCompany, makeContact, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const o = (kind: 'INV' | 'PO' | 'RCP', issueDate: string, contactCode = 'PLG') => ({ kind, issueDate, companyCode: 'UJI', contactCode });
const line = { description: 'Jasa', quantity: '1', unitPrice: '1000' };

test('numbers are sequential per company, per kind, per year, starting at 001', async () => {
	const { companyId } = await makeCompany();
	await db.transaction(async (tx) => {
		expect(await nextDocumentNumber(tx, companyId, o('INV', '2026-04-10'))).toBe('001/UJI-PLG/INV/IV/2026');
		expect(await nextDocumentNumber(tx, companyId, o('INV', '2026-04-11'))).toBe('002/UJI-PLG/INV/IV/2026');
		expect(await nextDocumentNumber(tx, companyId, o('PO', '2026-04-11'))).toBe('001/UJI-PLG/PO/IV/2026');
		expect(await nextDocumentNumber(tx, companyId, o('INV', '2027-01-02'))).toBe('001/UJI-PLG/INV/I/2027');
		expect(await nextDocumentNumber(tx, companyId, o('INV', '2026-05-01', 'ABC'))).toBe('003/UJI-ABC/INV/V/2026');
	});
});

test('RCP has its own sequence per company and year, separate from INV and PO', async () => {
	const { companyId } = await makeCompany();
	await db.transaction(async (tx) => {
		expect(await nextDocumentNumber(tx, companyId, o('INV', '2026-04-10'))).toBe('001/UJI-PLG/INV/IV/2026');
		expect(await nextDocumentNumber(tx, companyId, o('INV', '2026-04-11'))).toBe('002/UJI-PLG/INV/IV/2026');
		expect(await nextDocumentNumber(tx, companyId, o('INV', '2026-04-12'))).toBe('003/UJI-PLG/INV/IV/2026');
		expect(await nextDocumentNumber(tx, companyId, o('PO', '2026-04-12'))).toBe('001/UJI-PLG/PO/IV/2026');
		expect(await nextDocumentNumber(tx, companyId, o('PO', '2026-04-13'))).toBe('002/UJI-PLG/PO/IV/2026');
		expect(await nextDocumentNumber(tx, companyId, o('RCP', '2026-04-15'))).toBe('001/UJI-PLG/RCP/IV/2026');
		expect(await nextDocumentNumber(tx, companyId, o('RCP', '2026-04-16'))).toBe('002/UJI-PLG/RCP/IV/2026');
		expect(await nextDocumentNumber(tx, companyId, o('RCP', '2027-01-02'))).toBe('001/UJI-PLG/RCP/I/2027');
	});
	const rows = await db.select().from(documentNumberCounters).where(eq(documentNumberCounters.companyId, companyId));
	expect(rows.find((r) => r.prefix === 'RCP:v2' && r.year === '2026')?.lastSeq).toBe(2);
	expect(rows.some((r) => r.prefix === 'RCP:v2' && r.year === '2027')).toBe(true);
});

test('two companies never share a sequence', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	await db.transaction(async (tx) => {
		expect(await nextDocumentNumber(tx, a.companyId, o('INV', '2026-04-10'))).toBe('001/UJI-PLG/INV/IV/2026');
		expect(await nextDocumentNumber(tx, b.companyId, o('INV', '2026-04-10'))).toBe('001/UJI-PLG/INV/IV/2026');
	});
});

test('legacy counter rows are ignored: the new sequence restarts at 001', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await db.insert(documentNumberCounters).values({ companyId, prefix: 'INV', year: '2026', lastSeq: 5 });
	const { id: contactId } = await makeContact(companyId, 'CUSTOMER');
	const { id } = await createInvoice(companyId, u.id, { contactId, issueDate: '2026-04-10', lines: [line] });
	expect((await getInvoice(companyId, id)).invoiceNo).toBe('001/UJI-PLG/INV/IV/2026');
	const legacy = await db.select().from(documentNumberCounters).where(eq(documentNumberCounters.prefix, 'INV'));
	expect(legacy[0].lastSeq).toBe(5);
});

test('create is rejected without company code or contact code, and the counter is not bumped', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id: contactId } = await makeContact(companyId, 'CUSTOMER');
	const { id: noCode } = await makeContact(companyId, 'CUSTOMER', { code: null, name: 'Tanpa Kode' });
	const { id: vendor } = await makeContact(companyId, 'VENDOR', { code: null });

	await expect(createInvoice(companyId, u.id, { contactId: noCode, issueDate: '2026-04-10', lines: [line] })).rejects.toMatchObject({ status: 422, code: 'missing_contact_code', field: 'contactId' });
	await expect(createPurchaseOrder(companyId, u.id, { contactId: vendor, issueDate: '2026-04-10', lines: [line] })).rejects.toMatchObject({ status: 422, code: 'missing_contact_code' });

	await db.update(companies).set({ code: null }).where(eq(companies.id, companyId));
	await expect(createInvoice(companyId, u.id, { contactId, issueDate: '2026-04-10', lines: [line] })).rejects.toMatchObject({ status: 422, code: 'missing_company_code' });

	await db.update(companies).set({ code: 'UJI' }).where(eq(companies.id, companyId));
	const { id } = await createInvoice(companyId, u.id, { contactId, issueDate: '2026-04-10', lines: [line] });
	expect((await getInvoice(companyId, id)).invoiceNo).toBe('001/UJI-PLG/INV/IV/2026');
	const po = await createPurchaseOrder(companyId, u.id, { contactId: (await makeContact(companyId, 'VENDOR')).id, issueDate: '2026-04-10', lines: [line] });
	expect((await getPurchaseOrder(companyId, po.id)).poNo).toBe('001/UJI-PLG/PO/IV/2026');
});

test('update keeps the number even if the contact code is removed and the month changes; subject is stored and updated', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { id: contactId } = await makeContact(companyId, 'CUSTOMER');
	const { id } = await createInvoice(companyId, u.id, { contactId, issueDate: '2026-04-10', subject: 'Jasa April', lines: [line] });
	expect((await getInvoice(companyId, id)).subject).toBe('Jasa April');
	await db.update(contacts).set({ code: null }).where(eq(contacts.id, contactId));
	await updateInvoice(companyId, id, { contactId, issueDate: '2026-09-02', subject: 'Jasa September', lines: [line] });
	expect(await getInvoice(companyId, id)).toMatchObject({ invoiceNo: '001/UJI-PLG/INV/IV/2026', subject: 'Jasa September' });
});
