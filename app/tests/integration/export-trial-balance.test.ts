import { beforeEach, expect, test } from 'bun:test';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/reports/trial-balance/export/+server';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { makeCompany, makeUser, accountIdByCode, addMember, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function textOf(res: Response): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
	return (await parser.getText()).text;
}

test('PDF contains account codes/names, totals, and a Balance verdict', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [{ accountId: bankAccountId, debit: '1000000', credit: '0' }, { accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '1000000' }]
	});
	const url = '/api/reports/trial-balance/export?from=2026-08-01&to=2026-08-31';
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: url }) as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('application/pdf');
	const text = await textOf(res);
	expect(text).toContain('1-1002'); // Bank account code
	expect(text).toContain('1.000.000,00');
	expect(text).toContain('Balance');
});

test('an unbalanced book says "Tidak balance" in the PDF, not just on screen', async () => {
	// A lone debit line with no matching credit, via a raw journal insert, makes the book unbalanced
	// without going through generateJournal's own balance check.
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const { db } = await import('../../src/lib/server/db');
	const { journalEntries, journalLines } = await import('../../src/lib/server/db/schema');
	const acc = await accountIdByCode(companyId, '5-2010');
	const [entry] = await db.insert(journalEntries).values({ companyId, type: 'TRANSACTION', entryDate: '2026-08-05', createdBy: u.id }).returning({ id: journalEntries.id });
	await db.insert(journalLines).values({ journalId: entry.id, accountId: acc, debit: '500.00', credit: '0.00' });
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/trial-balance/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(await textOf(res)).toContain('Tidak balance');
});

test('viewer role is enough, accountant-only pages are not required for export', async () => {
	const { companyId } = await makeCompany();
	const viewer = await makeUser();
	const { addMember } = await import('./factory');
	await addMember(viewer.id, companyId, 'viewer');
	const res = await GET(fakeEvent({ ctx: await contextFor(viewer, companyId), path: '/api/reports/trial-balance/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(200);
});

test('no company context (not a member of any company) is a 401, same as the page itself', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/reports/trial-balance/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(401);
});

/**
 * Membangun neraca saldo dengan ~80+ baris non-zero: seluruh akun CoA default plus akun
 * tambahan, masing-masing diberi satu baris jurnal debit (via insert mentah, sama seperti
 * fixture "unbalanced" di atas) sehingga semuanya muncul di laporan. Mengembalikan kode akun
 * pertama & terakhir (urutan ascending by code, sama seperti query getTrialBalance) untuk
 * diverifikasi tetap utuh di teks PDF yang sudah berhalaman banyak.
 */
async function makeManyRowTrialBalance() {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const { db } = await import('../../src/lib/server/db');
	const { accounts, journalEntries, journalLines } = await import('../../src/lib/server/db/schema');
	const { eq } = await import('drizzle-orm');

	const existing = await db.query.accounts.findMany({ where: eq(accounts.companyId, companyId) });

	const EXTRA = 12;
	const extra: Array<{ id: string; code: string }> = [];
	for (let i = 0; i < EXTRA; i++) {
		const code = `9-${(9000 + i).toString()}`;
		const [row] = await db
			.insert(accounts)
			.values({ companyId, code, name: `Akun Tambahan ${i}`, type: 'EXPENSE', normalBal: 'DEBIT' })
			.returning({ id: accounts.id, code: accounts.code });
		extra.push(row);
	}

	const all = [...existing.map((a) => ({ id: a.id, code: a.code })), ...extra];
	expect(all.length).toBeGreaterThanOrEqual(80);
	all.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
	const first = all[0];
	const last = all[all.length - 1];

	const [entry] = await db
		.insert(journalEntries)
		.values({ companyId, type: 'TRANSACTION', entryDate: '2026-08-05', createdBy: u.id })
		.returning({ id: journalEntries.id });
	await db.insert(journalLines).values(
		all.map((a, i) => ({
			journalId: entry.id,
			accountId: a.id,
			// A large amount on the first account proves it survives as a single, non-wrapped
			// string even on a row near the top of a long, multi-page table.
			debit: i === 0 ? '125000000.00' : '500.00',
			credit: '0.00'
		}))
	);

	const name = await (async () => {
		const row = await db.query.accounts.findFirst({ where: eq(accounts.id, first.id) });
		return row!.name;
	})();
	const lastName = await (async () => {
		const row = await db.query.accounts.findFirst({ where: eq(accounts.id, last.id) });
		return row!.name;
	})();

	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/trial-balance/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(200);
	const text = await textOf(res);
	return { text, first, last, firstName: name, lastName };
}

test('a trial balance with 80+ rows keeps the first and last account intact (not scrambled across pages)', async () => {
	const { text, first, last, firstName, lastName } = await makeManyRowTrialBalance();
	expect(text).toContain(first.code);
	expect(text).toContain(firstName);
	expect(text).toContain(last.code);
	expect(text).toContain(lastName);
});

test('a large amount (>=100,000,000) on a long trial balance renders as one contiguous, non-wrapped string', async () => {
	const { text } = await makeManyRowTrialBalance();
	expect(text).toContain('125.000.000,00');
});
