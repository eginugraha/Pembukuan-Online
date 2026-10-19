import { beforeEach, expect, test } from 'bun:test';
import { createContact, listContacts, updateContact, deactivateContact } from '../../src/lib/server/invoicing/contacts';
import { makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('creates, lists filtered by kind, updates, and deactivates a contact', async () => {
	const { companyId } = await makeCompany();
	const { id } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Pelanggan' });
	await createContact(companyId, { kind: 'VENDOR', name: 'PT Vendor' });
	await createContact(companyId, { kind: 'BOTH', name: 'PT Keduanya' });

	expect((await listContacts(companyId, { kind: 'CUSTOMER' })).map((c) => c.name).sort()).toEqual(['PT Keduanya', 'PT Pelanggan']);
	expect((await listContacts(companyId, { kind: 'VENDOR' })).map((c) => c.name).sort()).toEqual(['PT Keduanya', 'PT Vendor']);

	await updateContact(companyId, id, { name: 'PT Pelanggan Baru' });
	expect((await listContacts(companyId)).find((c) => c.id === id)?.name).toBe('PT Pelanggan Baru');

	await deactivateContact(companyId, id);
	expect((await listContacts(companyId)).find((c) => c.id === id)?.isActive).toBe(false);
});

test('contacts are scoped per company', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	await createContact(a.companyId, { kind: 'CUSTOMER', name: 'Only in A' });
	expect(await listContacts(b.companyId)).toEqual([]);
});
