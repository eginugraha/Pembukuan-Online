import { and, asc, eq, or } from 'drizzle-orm';
import { ApiError, notFound } from '../api';
import { db, type Executor } from '../db';
import { contacts } from '../db/schema';
import { CreateContactInput, UpdateContactInput } from '../../schemas/contact';

export { CreateContactInput, UpdateContactInput };

export interface ContactRow {
	id: string;
	companyId: string;
	kind: 'CUSTOMER' | 'VENDOR' | 'BOTH';
	name: string;
	npwp: string | null;
	address: string | null;
	email: string | null;
	phone: string | null;
	isActive: boolean;
	createdAt: Date;
}

export async function createContact(companyId: string, input: CreateContactInput): Promise<{ id: string }> {
	const [row] = await db
		.insert(contacts)
		.values({
			companyId,
			kind: input.kind,
			name: input.name,
			npwp: input.npwp || null,
			address: input.address || null,
			email: input.email || null,
			phone: input.phone || null
		})
		.returning({ id: contacts.id });
	return row;
}

export async function updateContact(companyId: string, contactId: string, input: UpdateContactInput): Promise<void> {
	// Input kosong (mis. body `{}`): tidak ada yang diubah. Drizzle melempar "No values to set"
	// untuk `.set({})`, jadi cukup pastikan kontaknya ada lalu selesai.
	if (Object.values(input).every((v) => v === undefined)) {
		await getContact(companyId, contactId);
		return;
	}
	const updated = await db
		.update(contacts)
		.set(input)
		.where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)))
		.returning({ id: contacts.id });
	if (updated.length === 0) throw notFound('Kontak');
}

/** Kontak boleh dinonaktifkan meski sudah dirujuk invoice/PO lama (tidak seperti akun, tidak ada pengecekan in-use). */
export async function deactivateContact(companyId: string, contactId: string): Promise<void> {
	await updateContact(companyId, contactId, { isActive: false });
}

/** `activeOnly`: hanya kontak aktif -- dipakai pemilih kontak di form dokumen baru. */
export async function listContacts(
	companyId: string,
	opts: { kind?: 'CUSTOMER' | 'VENDOR'; activeOnly?: boolean } = {}
): Promise<ContactRow[]> {
	const where = and(
		eq(contacts.companyId, companyId),
		opts.kind ? or(eq(contacts.kind, opts.kind), eq(contacts.kind, 'BOTH')) : undefined,
		opts.activeOnly ? eq(contacts.isActive, true) : undefined
	);
	return db.select().from(contacts).where(where).orderBy(asc(contacts.name));
}

export async function getContact(companyId: string, contactId: string): Promise<ContactRow> {
	const row = await db.query.contacts.findFirst({ where: and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)) });
	if (!row) throw notFound('Kontak');
	return row;
}

/**
 * Kontak yang boleh dipakai di dokumen baru: milik perusahaan ini (404 kalau bukan -- lookup
 * di-scope ke `companyId`, jadi kontak perusahaan lain tidak bisa dirujuk), jenisnya cocok
 * (`kind` persis atau `BOTH`), dan masih aktif.
 */
export async function assertContact(
	ex: Executor,
	companyId: string,
	contactId: string,
	kind: 'CUSTOMER' | 'VENDOR'
): Promise<ContactRow> {
	const [row] = await ex
		.select()
		.from(contacts)
		.where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)))
		.limit(1);
	if (!row) throw notFound('Kontak');
	if (row.kind !== kind && row.kind !== 'BOTH') {
		const label = kind === 'CUSTOMER' ? 'pelanggan' : 'pemasok';
		throw new ApiError(422, 'wrong_contact_kind', `Kontak ini bukan ${label}`, undefined, { field: 'contactId' });
	}
	if (!row.isActive) {
		throw new ApiError(422, 'contact_inactive', 'Kontak ini sudah dinonaktifkan', undefined, { field: 'contactId' });
	}
	return row;
}
