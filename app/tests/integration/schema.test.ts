import { beforeEach, expect, test } from 'bun:test';
import { db } from '../../src/lib/server/db';
import { isUniqueViolation } from '../../src/lib/server/db/errors';
import { accounts, companies, journalEntries, journalLines } from '../../src/lib/server/db/schema';
import { resetDb } from './db';

beforeEach(resetDb);

async function setup() {
	const [c] = await db.insert(companies).values({ name: 'PT Uji' }).returning();
	const [a] = await db
		.insert(accounts)
		.values({ companyId: c.id, code: '1-1002', name: 'Bank', type: 'ASSET', normalBal: 'DEBIT' })
		.returning();
	const [e] = await db
		.insert(journalEntries)
		.values({ companyId: c.id, type: 'OPENING', entryDate: '2026-08-01' })
		.returning();
	return { c, a, e };
}

test('numeric round-trips as exact string', async () => {
	const { a, e } = await setup();
	await db.insert(journalLines).values({ journalId: e.id, accountId: a.id, debit: '1234567.89' });
	const [line] = await db.select().from(journalLines);
	expect(line.debit).toBe('1234567.89');
	expect(line.credit).toBe('0.00');
});

test('journal line must have exactly one non-zero side', async () => {
	const { a, e } = await setup();
	// Query builder Drizzle hanya "thenable"; bungkus dengan Promise.resolve agar bisa dipakai .rejects
	await expect(Promise.resolve(db.insert(journalLines).values({ journalId: e.id, accountId: a.id, debit: '1', credit: '1' }))).rejects.toThrow();
	await expect(Promise.resolve(db.insert(journalLines).values({ journalId: e.id, accountId: a.id }))).rejects.toThrow();
});

test('account code unique per company', async () => {
	const { c } = await setup();
	try {
		await db.insert(accounts).values({ companyId: c.id, code: '1-1002', name: 'Dup', type: 'ASSET', normalBal: 'DEBIT' });
		throw new Error('should fail');
	} catch (err) {
		expect(isUniqueViolation(err)).toBe(true);
	}
});
