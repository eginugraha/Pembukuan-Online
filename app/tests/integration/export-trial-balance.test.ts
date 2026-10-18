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
