import { beforeEach, expect, test } from 'bun:test';
import { PDFParse } from 'pdf-parse';
import { GET } from '../../src/routes/api/reports/income-statement/export/+server';
import { makeCompany, makeUser, makeUpload, accountIdByCode, addMember, contextFor } from './factory';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { db } from '../../src/lib/server/db';
import { transactions } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

async function textOf(res: Response): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
	return (await parser.getText()).text;
}

test('PDF shows revenue, Laba Kotor/Usaha/Sebelum Pajak subtotals and Laba Bersih', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const pendapatan = await accountIdByCode(companyId, '4-1001');
	const { uploadId } = await makeUpload(companyId, u.id, [{ date: '2026-08-05', description: 'Jasa', credit: '5000000' }]);
	await db.update(transactions).set({ isConfirmed: true, accountId: pendapatan }).where(eq(transactions.description, 'Jasa'));
	await generateJournal(companyId, uploadId, u.id);
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/income-statement/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(200);
	const text = await textOf(res);
	expect(text).toContain('Pendapatan Usaha');
	expect(text).toContain('Laba Kotor');
	expect(text).toContain('Laba Bersih');
	expect(text).toContain('5.000.000,00');
});

test('no company context is a 401, same as the page itself', async () => {
	const res = await GET(fakeEvent({ ctx: null, path: '/api/reports/income-statement/export?from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(401);
});
