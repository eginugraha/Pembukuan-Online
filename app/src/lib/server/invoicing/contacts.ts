import { and, asc, eq, or } from 'drizzle-orm';
import { notFound } from '../api';
import { db } from '../db';
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

export async function listContacts(companyId: string, opts: { kind?: 'CUSTOMER' | 'VENDOR' } = {}): Promise<ContactRow[]> {
	const where = opts.kind
		? and(eq(contacts.companyId, companyId), or(eq(contacts.kind, opts.kind), eq(contacts.kind, 'BOTH')))
		: eq(contacts.companyId, companyId);
	return db.select().from(contacts).where(where).orderBy(asc(contacts.name));
}

export async function getContact(companyId: string, contactId: string): Promise<ContactRow> {
	const row = await db.query.contacts.findFirst({ where: and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)) });
	if (!row) throw notFound('Kontak');
	return row;
}
