import { beforeEach, expect, test } from 'bun:test';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/reports/balance-sheet/export/+server';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { makeCompany, makeUser, accountIdByCode, addMember, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function textOf(res: Response): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
	return (await parser.getText()).text;
}

test('PDF shows both the asOf and comparative columns worth of content, and balances', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	await saveOpening(companyId, u.id, {
		date: '2026-01-01',
		lines: [{ accountId: bankAccountId, debit: '2000000', credit: '0' }, { accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '2000000' }]
	});
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/balance-sheet/export?as_of=2026-08-31' }) as never);
	expect(res.status).toBe(200);
	const text = await textOf(res);
	expect(text).toContain('ASET');
	expect(text).toContain('JUMLAH ASET');
	expect(text).toContain('2.000.000,00');
	expect(text).not.toContain('Jumlah aset tidak sama'); // balanced, no warning text
});

test('an unbalanced sheet prints the "Jumlah aset tidak sama..." warning with its date(s)', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const { db } = await import('../../src/lib/server/db');
	const { journalEntries, journalLines } = await import('../../src/lib/server/db/schema');
	const acc = await accountIdByCode(companyId, '5-2010');
	const [entry] = await db.insert(journalEntries).values({ companyId, type: 'TRANSACTION', entryDate: '2026-08-05', createdBy: u.id }).returning({ id: journalEntries.id });
	await db.insert(journalLines).values({ journalId: entry.id, accountId: acc, debit: '500.00', credit: '0.00' });
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/balance-sheet/export?as_of=2026-08-31' }) as never);
	expect(await textOf(res)).toContain('tidak sama dengan jumlah liabilitas');
});

test('no company context is a 401, same as the page itself', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/reports/balance-sheet/export?as_of=2026-08-31' }) as never);
	expect(res.status).toBe(401);
});
