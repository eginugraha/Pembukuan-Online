import { beforeEach, expect, test } from 'bun:test';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { journalEntries, journalLines, transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { listJournal } from '../../src/lib/server/journal/queries';
import { accountIdByCode, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

async function confirmedUpload() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const beban = await accountIdByCode(companyId, '5-2010');
	const pendapatan = await accountIdByCode(companyId, '4-1001');
	const { uploadId, txnIds } = await makeUpload(companyId, u.id, [
		{ date: '2026-08-02', description: 'BIAYA ADM', debit: '30000' },
		{ date: '2026-08-05', description: 'TRSF MASUK', credit: '2500000' },
		{ date: '2026-08-03', description: 'BIAYA LAIN', debit: '1000' }
	]);
	await db.update(transactions).set({ isConfirmed: true, accountId: beban }).where(eq(transactions.description, 'BIAYA ADM'));
	await db.update(transactions).set({ isConfirmed: true, accountId: pendapatan }).where(eq(transactions.description, 'TRSF MASUK'));
	await db.update(transactions).set({ isConfirmed: true, accountId: beban }).where(eq(transactions.description, 'BIAYA LAIN'));
	return { companyId, bankAccountId, u, beban, pendapatan, uploadId, txnIds };
}

test('creates balanced entries with sequential refs ordered by date', async () => {
	const { companyId, bankAccountId, u, beban, pendapatan, uploadId } = await confirmedUpload();
	expect(await generateJournal(companyId, uploadId, u.id)).toEqual({ created: 3 });
	const entries = await db.select().from(journalEntries).orderBy(asc(journalEntries.refNo));
	expect(entries.map((e) => [e.refNo, e.entryDate])).toEqual([
		['JE-202608-0001', '2026-08-02'],
		['JE-202608-0002', '2026-08-03'],
		['JE-202608-0003', '2026-08-05']
	]);
	const linesOf = (id: string) =>
		db.select({ accountId: journalLines.accountId, debit: journalLines.debit, credit: journalLines.credit }).from(journalLines).where(eq(journalLines.journalId, id));
	expect(await linesOf(entries[0].id)).toEqual(
		expect.arrayContaining([
			{ accountId: beban, debit: '30000.00', credit: '0.00' },
			{ accountId: bankAccountId, debit: '0.00', credit: '30000.00' }
		])
	);
	expect(await linesOf(entries[2].id)).toEqual(
		expect.arrayContaining([
			{ accountId: bankAccountId, debit: '2500000.00', credit: '0.00' },
			{ accountId: pendapatan, debit: '0.00', credit: '2500000.00' }
		])
	);
	expect(await generateJournal(companyId, uploadId, u.id)).toEqual({ created: 0 });
});

test('a historical BCA- ref does not block or get counted into the new JE- sequence', async () => {
	const { companyId, u, uploadId } = await confirmedUpload();
	await db.insert(journalEntries).values({
		companyId,
		type: 'TRANSACTION',
		entryDate: '2026-08-01',
		refNo: 'BCA-202608-0007',
		createdBy: u.id
	});
	await generateJournal(companyId, uploadId, u.id);
	const refs = (await db.select({ refNo: journalEntries.refNo }).from(journalEntries).where(eq(journalEntries.companyId, companyId))).map((r) => r.refNo);
	expect(refs).toContain('BCA-202608-0007');
	expect(refs).toEqual(expect.arrayContaining(['JE-202608-0001', 'JE-202608-0002', 'JE-202608-0003']));
});

test('concurrent generate calls never duplicate entries or refs', async () => {
	const { companyId, u, uploadId } = await confirmedUpload();
	const results = await Promise.all([
		generateJournal(companyId, uploadId, u.id),
		generateJournal(companyId, uploadId, u.id)
	]);
	expect(results.map((r) => r.created).sort()).toEqual([0, 3]);
	const entries = await db.select().from(journalEntries);
	expect(entries).toHaveLength(3);
	expect(new Set(entries.map((e) => e.refNo)).size).toBe(3);
});

test('refuses while transactions are unconfirmed; 404 for foreign upload', async () => {
	const { companyId, u, uploadId, txnIds } = await confirmedUpload();
	await db.update(transactions).set({ isConfirmed: false }).where(eq(transactions.id, txnIds[0]));
	expect(await codeOf(generateJournal(companyId, uploadId, u.id))).toBe('unconfirmed_transactions');
	const other = await makeCompany('PT Lain');
	expect(await codeOf(generateJournal(other.companyId, uploadId, u.id))).toBe('not_found');
});

test('listJournal groups lines per entry and totals', async () => {
	const { companyId, u, uploadId } = await confirmedUpload();
	await generateJournal(companyId, uploadId, u.id);
	const view = await listJournal(companyId, '2026-08-01', '2026-08-31');
	expect(view.entries).toHaveLength(3);
	expect(view.entries[0].lines).toHaveLength(2);
	expect(view.entries[0].lines[0].debit).toBe('30000.00'); // baris debit lebih dulu
	expect(view.totalDebit).toBe('2531000.00');
	expect(view.totalCredit).toBe('2531000.00');
});
