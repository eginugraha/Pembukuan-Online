import { beforeEach, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { authAccount, journalEntries, session, statementUploads, user, userCompanies } from '../../src/lib/server/db/schema';
import { verifyPassword } from '../../src/lib/server/password';
import { findUserByEmail } from '../../src/lib/server/users/create';
import { removeMember, setSuperAdmin } from '../../src/lib/server/users/service';
import { createUser, deleteUser, listAllUsers, setMembership, updateUser } from '../../src/lib/server/users/admin';
import { addMember, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

async function code(p: Promise<unknown>) {
	try {
		await p;
	} catch (e) {
		return (e as { code?: string }).code;
	}
	return undefined;
}

test('listAllUsers returns every user with their companies and roles', async () => {
	const a = await makeUser({ email: 'b@test.local' });
	const b = await makeUser({ email: 'a@test.local', isSuperAdmin: true });
	const c = await makeCompany('PT Satu');
	await addMember(a.id, c.companyId, 'accountant');
	const list = await listAllUsers();
	expect(list.map((u) => u.email)).toEqual(['a@test.local', 'b@test.local']);
	expect(list[0].isSuperAdmin).toBe(true);
	expect(list[0].companies).toEqual([]);
	expect(list[1].companies).toEqual([{ id: c.companyId, name: 'PT Satu', role: 'accountant' }]);
	expect(b.id).toBe(list[0].id);
});

test('createUser makes a credential account that can be found by email, duplicates (any case) are 409 email_taken', async () => {
	const { id } = await createUser({ name: 'Baru', email: 'Baru@Test.Local', password: 'password123', isSuperAdmin: false });
	const found = await findUserByEmail(db, 'baru@test.local');
	expect(found?.id).toBe(id);
	const [acc] = await db.select().from(authAccount).where(eq(authAccount.userId, id));
	expect(acc.providerId).toBe('credential');
	expect(await code(createUser({ name: 'X', email: 'BARU@test.local', password: 'password123', isSuperAdmin: false }))).toBe('email_taken');
});

test("updateUser changes name, normalizes email to lower case, and rejects another user's email", async () => {
	const a = await makeUser({ email: 'a@test.local' });
	await makeUser({ email: 'b@test.local' });
	await updateUser(a.id, { name: 'Nama Baru', email: 'AA@Test.Local' });
	const [row] = await db.select().from(user).where(eq(user.id, a.id));
	expect(row.name).toBe('Nama Baru');
	expect(row.email).toBe('aa@test.local');
	await updateUser(a.id, { name: 'Nama Baru', email: 'aa@test.local' });
	expect(await code(updateUser(a.id, { name: 'N', email: 'B@test.local' }))).toBe('email_taken');
	expect(await code(updateUser('00000000-0000-0000-0000-000000000000', { name: 'N', email: 'z@test.local' }))).toBe('not_found');
});

test('updateUser with password replaces the hash and revokes every session of that user but not others', async () => {
	const a = await makeUser();
	const b = await makeUser();
	const exp = new Date(Date.now() + 3600_000);
	await db.insert(session).values([
		{ userId: a.id, token: 't-a1', expiresAt: exp },
		{ userId: a.id, token: 't-a2', expiresAt: exp },
		{ userId: b.id, token: 't-b1', expiresAt: exp }
	]);
	await updateUser(a.id, { name: 'A', email: 'a-new@test.local', password: 'passwordBaru' });
	const [acc] = await db.select().from(authAccount).where(and(eq(authAccount.userId, a.id), eq(authAccount.providerId, 'credential')));
	expect(await verifyPassword('passwordBaru', acc.password!)).toBe(true);
	const rest = await db.select().from(session);
	expect(rest.map((s) => s.token)).toEqual(['t-b1']);
});

test('deleteUser removes the user, credentials, sessions and memberships but keeps data they created', async () => {
	const actor = await makeUser({ isSuperAdmin: true });
	const u = await makeUser();
	const c = await makeCompany();
	await addMember(u.id, c.companyId, 'admin');
	await db.insert(session).values({ userId: u.id, token: 't-u', expiresAt: new Date(Date.now() + 3600_000) });
	const { uploadId } = await makeUpload(c.companyId, u.id, [{ description: 'x' }]);
	const [je] = await db
		.insert(journalEntries)
		.values({ companyId: c.companyId, type: 'TRANSACTION', entryDate: '2026-08-15', createdBy: u.id })
		.returning({ id: journalEntries.id });
	await deleteUser(actor.id, u.id);
	expect(await db.select().from(user).where(eq(user.id, u.id))).toHaveLength(0);
	expect(await db.select().from(authAccount).where(eq(authAccount.userId, u.id))).toHaveLength(0);
	expect(await db.select().from(session).where(eq(session.userId, u.id))).toHaveLength(0);
	expect(await db.select().from(userCompanies).where(eq(userCompanies.userId, u.id))).toHaveLength(0);
	const [up] = await db.select().from(statementUploads).where(eq(statementUploads.id, uploadId));
	expect(up.uploadedBy).toBeNull();
	const [j] = await db.select().from(journalEntries).where(eq(journalEntries.id, je.id));
	expect(j.createdBy).toBeNull();
	expect(await code(deleteUser(actor.id, u.id))).toBe('not_found');
});

test('deleteUser refuses self and refuses the last super admin', async () => {
	const s1 = await makeUser({ isSuperAdmin: true });
	const regular = await makeUser();
	expect(await code(deleteUser(s1.id, s1.id))).toBe('cannot_delete_self');
	expect(await code(deleteUser(regular.id, s1.id))).toBe('last_super_admin');
	const s2 = await makeUser({ isSuperAdmin: true });
	await deleteUser(s2.id, s1.id);
	expect(await db.select().from(user).where(eq(user.id, s1.id))).toHaveLength(0);
});

test('setMembership adds then changes a role; removeMember on the last admin is still refused', async () => {
	const u = await makeUser();
	const c = await makeCompany();
	await setMembership(u.id, c.companyId, 'admin');
	const rows = () => db.select().from(userCompanies).where(eq(userCompanies.userId, u.id));
	expect((await rows())[0].role).toBe('admin');
	const other = await makeUser();
	await setMembership(other.id, c.companyId, 'viewer');
	await setMembership(other.id, c.companyId, 'accountant');
	expect((await db.select().from(userCompanies).where(eq(userCompanies.userId, other.id)))[0].role).toBe('accountant');
	expect(await code(removeMember(c.companyId, u.id))).toBe('last_admin');
	expect(await code(setMembership(u.id, '00000000-0000-0000-0000-000000000000', 'admin'))).toBe('not_found');
	expect(await code(setMembership('00000000-0000-0000-0000-000000000000', c.companyId, 'admin'))).toBe('not_found');
});

test('setSuperAdmin refuses to revoke the only super admin, allows it when another remains', async () => {
	const s1 = await makeUser({ isSuperAdmin: true });
	const regular = await makeUser();
	expect(await code(setSuperAdmin(regular.id, s1.id, false))).toBe('last_super_admin');
	const s2 = await makeUser({ isSuperAdmin: true });
	await setSuperAdmin(s2.id, s1.id, false);
	const [row] = await db.select().from(user).where(eq(user.id, s1.id));
	expect(row.isSuperAdmin).toBe(false);
	expect(await code(setSuperAdmin(regular.id, crypto.randomUUID(), false))).toBe('not_found');
});

test('deleteUser of one of two super admins succeeds', async () => {
	const s1 = await makeUser({ isSuperAdmin: true });
	const s2 = await makeUser({ isSuperAdmin: true });
	await deleteUser(s1.id, s2.id);
	expect(await db.select().from(user).where(eq(user.id, s2.id))).toHaveLength(0);
});

test('concurrent mutual deletes of two super admins leave exactly one', async () => {
	for (let i = 0; i < 10; i++) {
		await resetDb();
		const a = await makeUser({ isSuperAdmin: true });
		const b = await makeUser({ isSuperAdmin: true });
		const results = await Promise.allSettled([deleteUser(a.id, b.id), deleteUser(b.id, a.id)]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
		expect(rejected).toHaveLength(1);
		expect((rejected[0].reason as { code?: string }).code).toBe('last_super_admin');
		const left = await db.select().from(user).where(eq(user.isSuperAdmin, true));
		expect(left).toHaveLength(1);
	}
});

test('concurrent mutual revokes of two super admins leave exactly one', async () => {
	for (let i = 0; i < 10; i++) {
		await resetDb();
		const a = await makeUser({ isSuperAdmin: true });
		const b = await makeUser({ isSuperAdmin: true });
		const results = await Promise.allSettled([setSuperAdmin(a.id, b.id, false), setSuperAdmin(b.id, a.id, false)]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
		expect((rejected[0].reason as { code?: string }).code).toBe('last_super_admin');
		const left = await db.select().from(user).where(eq(user.isSuperAdmin, true));
		expect(left).toHaveLength(1);
	}
});
