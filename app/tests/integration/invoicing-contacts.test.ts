import { beforeEach, expect, test } from 'bun:test';
import { createContact, listContacts, updateContact, deleteContact, getContact, assertContact } from '../../src/lib/server/invoicing/contacts';
import { makeCompany } from './factory';
import { resetDb } from './db';
import { db } from '../../src/lib/server/db';

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

	await deleteContact(companyId, id);
	expect((await listContacts(companyId)).find((c) => c.id === id)).toBeUndefined();
});

test('stores attention and position, and edit can set and clear them', async () => {
	const { companyId } = await makeCompany();
	const { id } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Pelanggan', attention: 'Budi', position: 'Manajer Keuangan', phone: '0812' });
	expect(await getContact(companyId, id)).toMatchObject({ attention: 'Budi', position: 'Manajer Keuangan', phone: '0812' });

	await updateContact(companyId, id, { attention: 'Sari', phone: '' });
	expect(await getContact(companyId, id)).toMatchObject({ attention: 'Sari', position: 'Manajer Keuangan', phone: null });
});

test('soft delete hides the contact from lists and new documents but getContact still reads it', async () => {
	const { companyId } = await makeCompany();
	const { id } = await createContact(companyId, { kind: 'CUSTOMER', name: 'PT Dihapus' });
	await deleteContact(companyId, id);

	expect(await listContacts(companyId, { kind: 'CUSTOMER', activeOnly: true })).toEqual([]);
	expect((await getContact(companyId, id)).name).toBe('PT Dihapus');
	await expect(assertContact(db, companyId, id, 'CUSTOMER')).rejects.toMatchObject({ status: 404 });
	await expect(updateContact(companyId, id, { name: 'X' })).rejects.toMatchObject({ status: 404 });
	await expect(deleteContact(companyId, id)).rejects.toMatchObject({ status: 404 });
});

test('contacts are scoped per company', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	await createContact(a.companyId, { kind: 'CUSTOMER', name: 'Only in A' });
	expect(await listContacts(b.companyId)).toEqual([]);
});

test('contact code disimpan uppercase', async () => {
	const { CreateContactInput } = await import('../../src/lib/schemas/contact');
	const { companyId } = await makeCompany();
	const { id } = await createContact(companyId, CreateContactInput.parse({ kind: 'CUSTOMER', name: 'PT RFS', code: 'rfs' }));
	expect((await getContact(companyId, id)).code).toBe('RFS');
});
