import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { statementUploads, transactions } from '../../src/lib/server/db/schema';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { createManualEntry, createUpload, type UploadDeps } from '../../src/lib/server/uploads/service';
import type { ParsedStatement } from '../../src/lib/server/uploads/sidecar-client';
import { POST } from '../../src/routes/api/uploads/manual/+server';
import { accountIdByCode, addMember, contextFor, makeCompany, makeUser } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

function manualDeps() {
	const enqueued: string[] = [];
	return { deps: { enqueue: (id: string) => enqueued.push(id) }, enqueued };
}

const codeOf = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		return (e as { code: string }).code;
	}
	return null;
};

test('computes period, running balance, filename and enqueues, from unsorted rows', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { deps, enqueued } = manualDeps();
	const res = await createManualEntry(
		{
			companyId,
			userId: u.id,
			bank: 'Mandiri',
			accountNo: '999-1',
			rows: [
				{ date: '2026-08-05', description: 'Transfer keluar', direction: 'DB', amount: '50000' },
				{ date: '2026-08-02', description: 'Transfer masuk', direction: 'CR', amount: '200000' }
			]
		},
		deps
	);
	expect(enqueued).toEqual([res.id]);
	expect(res.balanceWarning).toBeNull();
	const upload = await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, res.id) });
	expect(upload).toMatchObject({
		bank: 'Mandiri',
		accountNo: '9991',
		periodStart: '2026-08-02',
		periodEnd: '2026-08-05',
		openingBalance: '0.00',
		closingBalance: '150000.00',
		filename: 'Input manual — 2026-08-02 s/d 2026-08-05'
	});
	const rows = await db.select().from(transactions).where(eq(transactions.uploadId, res.id)).orderBy(transactions.lineNo);
	expect(rows.map((r) => ({ date: r.txnDate, balance: r.balance }))).toEqual([
		{ date: '2026-08-02', balance: '200000.00' },
		{ date: '2026-08-05', balance: '150000.00' }
	]);
});

test('defaults opening balance to the book balance at period start when omitted', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '900000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '900000' }
		]
	});
	const { deps } = manualDeps();
	const res = await createManualEntry(
		{ companyId, userId: u.id, bank: 'BRI', accountNo: '1', rows: [{ date: '2026-08-10', description: 'X', direction: 'CR', amount: '1000' }] },
		deps
	);
	expect(res.balanceWarning).toBeNull();
	const upload = await db.query.statementUploads.findFirst({ where: eq(statementUploads.id, res.id) });
	expect(upload).toMatchObject({ openingBalance: '900000.00', closingBalance: '901000.00' });
});

test('an explicit opening balance that differs from the book balance warns, like the PDF path', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [
			{ accountId: bankAccountId, debit: '900000', credit: '0' },
			{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '900000' }
		]
	});
	const { deps } = manualDeps();
	const res = await createManualEntry(
		{ companyId, userId: u.id, bank: 'BRI', accountNo: '1', openingBalance: '100000', rows: [{ date: '2026-08-10', description: 'X', direction: 'CR', amount: '1000' }] },
		deps
	);
	expect(res.balanceWarning).toContain('900.000,00');
});

test('duplicate detection applies across manual and PDF paths for the same account+period', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	const { deps } = manualDeps();
	await createManualEntry(
		{ companyId, userId: u.id, bank: 'BRI', accountNo: '555', rows: [{ date: '2026-08-10', description: 'X', direction: 'CR', amount: '1000' }] },
		deps
	);
	const pdfDeps: UploadDeps = {
		parse: async () =>
			({
				account_no: '555',
				period_start: '2026-08-05',
				period_end: '2026-08-15',
				opening_balance: '0',
				closing_balance: '0',
				transactions: []
			}) satisfies ParsedStatement,
		enqueue: () => {}
	};
	const pdf = new File([new TextEncoder().encode('%PDF-1.4 fake')], 'st.pdf', { type: 'application/pdf' });
	expect(await codeOf(createUpload({ companyId, userId: u.id, file: pdf }, pdfDeps))).toBe('duplicate_statement');
});

test('route: accountant can create, viewer cannot, invalid body reports Indonesian field errors', async () => {
	const { companyId } = await makeCompany();
	const accountant = await makeUser();
	await addMember(accountant.id, companyId, 'accountant');
	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');

	const body = { bank: 'Mandiri', accountNo: '1', rows: [{ date: '2026-08-10', description: 'X', direction: 'CR', amount: '1000' }] };

	const forbidden = await call(POST, fakeEvent({ ctx: await contextFor(viewer, companyId), method: 'POST', body }));
	expect(forbidden.status).toBe(403);

	const ok = await call(POST, fakeEvent({ ctx: await contextFor(accountant, companyId), method: 'POST', body }));
	expect(ok.status).toBe(201);
	expect(ok.body.id).toBeString();

	const invalid = await call(POST, fakeEvent({ ctx: await contextFor(accountant, companyId), method: 'POST', body: { bank: '', accountNo: '', rows: [] } }));
	expect(invalid.status).toBe(400);
	expect(invalid.body.error.fields).toMatchObject({ bank: 'Nama bank wajib diisi', accountNo: 'Nomor rekening wajib diisi', rows: 'Isi minimal satu baris transaksi' });
});
