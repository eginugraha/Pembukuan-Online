import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createArAp, deleteArAp, setTermPaid, type CreateArApInput } from '../../src/lib/server/arap/entries';
import { getArApSummary } from '../../src/lib/server/arap/summary';
import { db } from '../../src/lib/server/db';
import { arApTerms, companies } from '../../src/lib/server/db/schema';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { accountIdByCode, makeCompany, makeContact, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const { id: customerId } = await makeContact(companyId, 'CUSTOMER', { name: 'PT Pelanggan', code: 'PLG' });
	const { id: vendorId } = await makeContact(companyId, 'VENDOR', { name: 'PT Pemasok', code: 'PMS' });
	return { companyId, bankAccountId, userId: u.id, customerId, vendorId };
}

function input(contactId: string, overrides: Partial<CreateArApInput> = {}): CreateArApInput {
	return { kind: 'AR', contactId, title: 'Proyek A', total: '100000000', currency: 'IDR', paid: false, documentId: null, terms: [], ...overrides };
}
const threeTerms = () => [
	{ name: 'DP', percent: '30', paid: true, documentId: null },
	{ name: 'Termin 2', percent: '40', paid: false, documentId: null },
	{ name: 'Pelunasan', percent: '30', paid: false, documentId: null }
];

async function fundBank(companyId: string, bankAccountId: string, userId: string, amount: string) {
	await saveOpening(companyId, userId, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: amount, credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: amount }
		]
	});
}

test('sums unpaid terms per kind and currency; net = bank + AR - AP', async () => {
	const { companyId, bankAccountId, userId, customerId, vendorId } = await setup();
	await fundBank(companyId, bankAccountId, userId, '1000000');
	await createArAp(companyId, userId, input(customerId, { terms: threeTerms() }));
	await createArAp(companyId, userId, input(customerId, { title: 'Proyek B', total: '5000000' }));
	await createArAp(companyId, userId, input(vendorId, { kind: 'AP', title: 'Beli', total: '2000000' }));
	await createArAp(companyId, userId, input(customerId, { title: 'Ekspor', total: '300', currency: 'USD' }));
	const s = await getArApSummary(companyId);
	expect(s.ar).toEqual({ IDR: '75000000.00', USD: '300.00' });
	expect(s.ap).toEqual({ IDR: '2000000.00', USD: '0.00' });
	expect(s.bank).toEqual({ name: 'Bank BCA', balance: '1000000.00' });
	expect(s.net).toEqual({ IDR: '74000000.00', USD: '300.00' });
});

test('no data gives all zeros', async () => {
	const { companyId } = await setup();
	const s = await getArApSummary(companyId);
	expect(s.ar).toEqual({ IDR: '0.00', USD: '0.00' });
	expect(s.ap).toEqual({ IDR: '0.00', USD: '0.00' });
	expect(s.net).toEqual({ IDR: '0.00', USD: '0.00' });
	expect(s.bank?.balance).toBe('0.00');
});

test('USD-only entries with no bank account do not throw', async () => {
	const { companyId, userId, customerId, vendorId } = await setup();
	await db.update(companies).set({ bankAccountId: null }).where(eq(companies.id, companyId));
	await createArAp(companyId, userId, input(customerId, { total: '500', currency: 'USD' }));
	await createArAp(companyId, userId, input(vendorId, { kind: 'AP', total: '120', currency: 'USD' }));
	const s = await getArApSummary(companyId);
	expect(s.bank).toBeNull();
	expect(s.net).toEqual({ IDR: '0.00', USD: '380.00' });
});

test('deleted entries are excluded', async () => {
	const { companyId, userId, customerId } = await setup();
	const { id } = await createArAp(companyId, userId, input(customerId, { total: '1000' }));
	await createArAp(companyId, userId, input(customerId, { title: 'B', total: '250' }));
	await deleteArAp(companyId, id);
	expect((await getArApSummary(companyId)).ar.IDR).toBe('250.00');
});

test('marking terms paid lowers AR but leaves bank balance unchanged', async () => {
	const { companyId, bankAccountId, userId, customerId } = await setup();
	await fundBank(companyId, bankAccountId, userId, '1000000');
	const { id } = await createArAp(companyId, userId, input(customerId, { terms: threeTerms() }));
	const before = await getArApSummary(companyId);
	const terms = await db.select().from(arApTerms).where(eq(arApTerms.entryId, id));
	const t2 = terms.find((t) => t.name === 'Termin 2')!;
	await setTermPaid(companyId, id, t2.id, true);
	const after = await getArApSummary(companyId);
	expect(after.ar.IDR).toBe('30000000.00');
	expect(before.ar.IDR).toBe('70000000.00');
	expect(after.bank?.balance).toBe(before.bank?.balance);
});

test('another company\'s entries do not appear in this company\'s summary', async () => {
	const a = await setup();
	await createArAp(a.companyId, a.userId, input(a.customerId, { total: '1000' }));
	const other = await makeCompany('PT Lain');
	const { id: otherCustomer } = await makeContact(other.companyId, 'CUSTOMER', { name: 'PT B', code: 'PTB' });
	const { id: otherVendor } = await makeContact(other.companyId, 'VENDOR', { name: 'PT V', code: 'PTV' });
	await createArAp(other.companyId, a.userId, input(otherCustomer, { total: '7777' }));
	await createArAp(other.companyId, a.userId, input(otherCustomer, { total: '50', currency: 'USD' }));
	await createArAp(other.companyId, a.userId, input(otherVendor, { kind: 'AP', total: '3333' }));
	const s = await getArApSummary(a.companyId);
	expect(s.ar).toEqual({ IDR: '1000.00', USD: '0.00' });
	expect(s.ap).toEqual({ IDR: '0.00', USD: '0.00' });
	expect((await getArApSummary(other.companyId)).ar).toEqual({ IDR: '7777.00', USD: '50.00' });
});
