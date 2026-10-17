import { beforeEach, expect, test } from 'bun:test';
import { count, eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { journalEntries, statementUploads, transactions } from '../../src/lib/server/db/schema';
import { closeFiscalYear } from '../../src/lib/server/closing/close';
import { deleteAccount } from '../../src/lib/server/accounts/delete';
import { updateJournalAccount } from '../../src/lib/server/journal/edit';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { bulkConfirm, confirmTransaction } from '../../src/lib/server/transactions/confirm';
import { createUpload, deleteUpload, type UploadDeps } from '../../src/lib/server/uploads/service';
import type { ParsedStatement } from '../../src/lib/server/uploads/sidecar-client';
import { accountIdByCode, makeCompany, makeUpload, makeUser } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const TODAY = '2027-02-10';
const MSG = 'Tahun buku 2026 sudah ditutup';

const outcome = (p: Promise<unknown>) =>
	p.then(
		() => ({ ok: true as const }),
		(e) => ({ ok: false as const, code: e.code as string, message: e.message as string })
	);

async function confirmAll(companyId: string, ids: string[], codes: string[]) {
	for (const [i, id] of ids.entries())
		await db.update(transactions).set({ isConfirmed: true, accountId: await accountIdByCode(companyId, codes[i]) }).where(eq(transactions.id, id));
}

async function setup() {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2025-01-01',
		lines: [
			{ accountId: bankAccountId, debit: '10000000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '10000000' }
		]
	});
	const y26 = await makeUpload(
		companyId,
		u.id,
		[
			{ date: '2026-03-01', description: 'JUAL', credit: '5000000' },
			{ date: '2026-03-04', description: 'OPS', debit: '300000' }
		],
		{ status: 'done', periodStart: '2026-03-01', periodEnd: '2026-03-31' }
	);
	await confirmAll(companyId, y26.txnIds, ['4-1001', '5-2010']);
	await generateJournal(companyId, y26.uploadId, u.id);
	await closeFiscalYear(companyId, u.id, { periodStart: '2026-01-01', retainedEarningsAccountId: await accountIdByCode(companyId, '3-1003') }, TODAY);

	const y27 = await makeUpload(
		companyId,
		u.id,
		[
			{ date: '2027-01-05', description: 'JUAL27', credit: '1000000' },
			{ date: '2027-01-06', description: 'ATK', debit: '100000' }
		],
		{ status: 'done', accountNo: '999', periodStart: '2027-01-01', periodEnd: '2027-01-31' }
	);
	await confirmAll(companyId, y27.txnIds, ['4-1001', '5-2006']);
	await generateJournal(companyId, y27.uploadId, u.id);
	return { companyId, userId: u.id, bankAccountId, y26, y27 };
}

const entryOf = async (txnId: string) => (await db.query.journalEntries.findFirst({ where: eq(journalEntries.transactionId, txnId) }))!;

test('generateJournal rejects a late upload with 2026 transactions', async () => {
	const { companyId, userId } = await setup();
	const late = await makeUpload(companyId, userId, [{ date: '2026-06-01', description: 'LATE', debit: '1000' }], { status: 'done', accountNo: '555', periodStart: '2026-06-01', periodEnd: '2026-06-30' });
	await confirmAll(companyId, late.txnIds, ['5-2010']);
	const r = await outcome(generateJournal(companyId, late.uploadId, userId));
	expect(r).toMatchObject({ ok: false, code: 'period_closed' });
	expect((r as { message: string }).message).toContain(MSG);
});

test('updateJournalAccount: 2026 locked, Jan 2027 allowed', async () => {
	const { companyId, userId, y26, y27 } = await setup();
	const target = await accountIdByCode(companyId, '5-2004');
	const r = await outcome(updateJournalAccount(companyId, userId, (await entryOf(y26.txnIds[1])).id, target));
	expect(r).toMatchObject({ ok: false, code: 'period_closed' });
	expect((r as { message: string }).message).toContain(MSG);
	expect(await outcome(updateJournalAccount(companyId, userId, (await entryOf(y27.txnIds[1])).id, target))).toEqual({ ok: true });
});

test('saveOpening is rejected for any date once a year is closed', async () => {
	const { companyId, userId, bankAccountId } = await setup();
	const lines = [
		{ accountId: bankAccountId, debit: '1000', credit: '0' },
		{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '1000' }
	];
	for (const date of ['2025-01-01', '2027-06-01']) {
		const r = await outcome(saveOpening(companyId, userId, { date, lines }));
		expect(r).toMatchObject({ ok: false, code: 'period_closed' });
		expect((r as { message: string }).message).toContain(MSG);
	}
});

test('deleteAccount blocked when used in 2026, allowed when used only in 2027', async () => {
	const { companyId } = await setup();
	const r = await outcome(deleteAccount(companyId, await accountIdByCode(companyId, '5-2010'), await accountIdByCode(companyId, '5-2004')));
	expect(r).toMatchObject({ ok: false, code: 'period_closed' });
	expect((r as { message: string }).message).toContain(MSG);
	expect(await outcome(deleteAccount(companyId, await accountIdByCode(companyId, '5-2006'), await accountIdByCode(companyId, '5-2004')))).toEqual({ ok: true });
});

test('deleteUpload of a 2026 upload is rejected and the upload stays', async () => {
	const { companyId, y26, y27 } = await setup();
	const r = await outcome(deleteUpload(companyId, y26.uploadId));
	expect(r).toMatchObject({ ok: false, code: 'period_closed' });
	expect((r as { message: string }).message).toContain(MSG);
	expect(await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, y26.uploadId) })).toBeTruthy();
	expect(await outcome(deleteUpload(companyId, y27.uploadId))).toEqual({ ok: true });
});

test('confirmTransaction and bulkConfirm reject 2026 transactions', async () => {
	const { companyId, userId } = await setup();
	const p = await makeUpload(companyId, userId, [{ date: '2026-07-01', description: 'PENDING', debit: '1000' }], { status: 'review', accountNo: '777', periodStart: '2026-07-01', periodEnd: '2026-07-31' });
	const accountId = await accountIdByCode(companyId, '5-2010');
	const r = await outcome(confirmTransaction(companyId, userId, p.txnIds[0], { accountId }));
	expect(r).toMatchObject({ ok: false, code: 'period_closed' });
	expect((r as { message: string }).message).toContain(MSG);

	await db.update(transactions).set({ aiSuggestedAccountId: accountId, aiConfidence: '0.950' }).where(eq(transactions.id, p.txnIds[0]));
	const b = await outcome(bulkConfirm(companyId, userId, { uploadId: p.uploadId }));
	expect(b).toMatchObject({ ok: false, code: 'period_closed' });
	const [t] = await db.select().from(transactions).where(eq(transactions.id, p.txnIds[0]));
	expect(t.isConfirmed).toBe(false);
});

test('createUpload rejects the whole upload when any transaction is in a closed year', async () => {
	const { companyId, userId } = await setup();
	const st: ParsedStatement = {
		account_no: '4242',
		period_start: '2026-12-01',
		period_end: '2027-01-31',
		opening_balance: '0.00',
		closing_balance: '0.00',
		transactions: [
			{ line_no: 1, date: '2026-12-20', description: 'DES', amount: '1000.00', direction: 'DB', balance: null },
			{ line_no: 2, date: '2027-01-10', description: 'JAN', amount: '1000.00', direction: 'DB', balance: null }
		]
	};
	const deps: UploadDeps = { parse: async () => st, enqueue: () => {} };
	const file = new File([new TextEncoder().encode('%PDF-1.4 fake')], 'st.pdf');
	const [u0] = await db.select({ n: count() }).from(statementUploads);
	const [t0] = await db.select({ n: count() }).from(transactions);
	const r = await outcome(createUpload({ companyId, userId, file }, deps));
	expect(r).toMatchObject({ ok: false, code: 'period_closed' });
	expect((r as { message: string }).message).toContain(MSG);
	expect((await db.select({ n: count() }).from(statementUploads))[0].n).toBe(u0.n);
	expect((await db.select({ n: count() }).from(transactions))[0].n).toBe(t0.n);
});
