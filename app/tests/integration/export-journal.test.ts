import { beforeEach, expect, test } from 'bun:test';
import ExcelJS from 'exceljs';
import { GET } from '../../src/routes/api/reports/journal/export/+server';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { makeCompany, makeUser, accountIdByCode, addMember, contextFor } from './factory';
import { call, fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

test('xlsx format: role viewer+ required, bytes parse back to the same rows', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await saveOpening(companyId, u.id, {
		date: '2026-08-01',
		lines: [{ accountId: bankAccountId, debit: '1000000', credit: '0' }, { accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '1000000' }]
	});

	const viewer = await makeUser();
	await addMember(viewer.id, companyId, 'viewer');
	const url = '/api/reports/journal/export?format=xlsx&from=2026-08-01&to=2026-08-31';
	const res = await GET(fakeEvent({ ctx: await contextFor(viewer, companyId), path: url }) as never);
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toContain('spreadsheetml');
	expect(res.headers.get('content-disposition')).toContain('jurnal_2026-08-01_2026-08-31.xlsx');

	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(await res.arrayBuffer());
	const ws = wb.worksheets[0];
	expect(ws.getRow(1).getCell(1).value).toBe('Tanggal');
	expect(ws.getRow(2).getCell(7).value).toBe(1000000); // Debit, as a number
});

test('csv format: unauthenticated/no-company request is rejected', async () => {
	const url = '/api/reports/journal/export?format=csv&from=2026-08-01&to=2026-08-31';
	const res = await GET(fakeEvent({ ctx: null, path: url }) as never);
	expect(res.status).toBe(401);
});

test('invalid format value is a 400, not a 500', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/journal/export?format=word&from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(400);
});
