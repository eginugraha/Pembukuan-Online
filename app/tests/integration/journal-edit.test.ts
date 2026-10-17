import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { journalEntries, journalLines, transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { updateJournalAccount } from '../../src/lib/server/journal/edit';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { listJournal } from '../../src/lib/server/journal/queries';
import { getLedger } from '../../src/lib/server/reports/ledger';
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

async function journaled() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	const beban = await accountIdByCode(companyId, '5-2010');
	const { uploadId, txnIds } = await makeUpload(companyId, u.id, [{ date: '2026-08-02', description: 'BIAYA ADM', debit: '30000' }]);
	await db.update(transactions).set({ isConfirmed: true, accountId: beban }).where(eq(transactions.id, txnIds[0]));
	await generateJournal(companyId, uploadId, u.id);
	const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.companyId, companyId));
	return { companyId, bankAccountId, u, beban, txnId: txnIds[0], entryId: entry.id };
}

const lines = (entryId: string) => db.select().from(journalLines).where(eq(journalLines.journalId, entryId));

test('moves only the category line; bank line, amounts and balance are untouched; transaction follows', async () => {
	const { companyId, bankAccountId, u, beban, txnId, entryId } = await journaled();
	const gaji = await accountIdByCode(companyId, '5-2001');
	await updateJournalAccount(companyId, u.id, entryId, gaji);

	const after = await lines(entryId);
	expect(after.find((l) => l.accountId === bankAccountId)).toMatchObject({ debit: '0.00', credit: '30000.00' });
	expect(after.find((l) => l.accountId === gaji)).toMatchObject({ debit: '30000.00', credit: '0.00' });
	expect(after.some((l) => l.accountId === beban)).toBe(false);
	expect(after.reduce((s, l) => s + Number(l.debit), 0)).toBe(after.reduce((s, l) => s + Number(l.credit), 0));

	const [txn] = await db.select().from(transactions).where(eq(transactions.id, txnId));
	expect(txn).toMatchObject({ accountId: gaji, source: 'USER', confirmedBy: u.id, isConfirmed: true });

	expect((await getLedger(companyId, beban, '2026-08-01', '2026-08-31')).lines).toHaveLength(0);
	expect((await getLedger(companyId, gaji, '2026-08-01', '2026-08-31')).closingBalance).toBe('30000.00');

	const view = await listJournal(companyId, '2026-08-01', '2026-08-31');
	const cat = view.entries[0].lines.find((l) => l.accountId === gaji)!;
	expect(cat.editable).toBe(true);
	expect(view.entries[0].lines.find((l) => l.accountId === bankAccountId)!.editable).toBe(false);
});

test('rejects bank account, non-leaf account, OPENING entries and foreign entries', async () => {
	const { companyId, bankAccountId, u, entryId } = await journaled();
	expect(await codeOf(updateJournalAccount(companyId, u.id, entryId, bankAccountId))).toBe('bank_account_not_allowed');
	expect(await codeOf(updateJournalAccount(companyId, u.id, entryId, await accountIdByCode(companyId, '5-2000')))).toBe('invalid_account');

	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '1000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '1000' }
		]
	});
	const [opening] = await db.select().from(journalEntries).where(eq(journalEntries.type, 'OPENING'));
	expect(await codeOf(updateJournalAccount(companyId, u.id, opening.id, await accountIdByCode(companyId, '5-2001')))).toBe('journal_not_editable');

	const other = await makeCompany('PT Lain');
	expect(await codeOf(updateJournalAccount(other.companyId, u.id, entryId, await accountIdByCode(other.companyId, '5-2001')))).toBe('not_found');
});
