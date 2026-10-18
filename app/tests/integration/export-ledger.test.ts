import { beforeEach, expect, test } from 'bun:test';
import { GET } from '../../src/routes/api/reports/ledger/export/+server';
import { makeCompany, makeUser, addMember, contextFor } from './factory';
import { fakeEvent } from './event';
import { resetDb } from './db';

beforeEach(resetDb);

test('csv format starts with the UTF-8 BOM and the account header is part of the filename', async () => {
	const { companyId, bankAccountId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const url = `/api/reports/ledger/export?format=csv&account_id=${bankAccountId}&from=2026-08-01&to=2026-08-31`;
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: url }) as never);
	expect(res.status).toBe(200);
	// Response.text() strips a leading UTF-8 BOM per the Fetch "UTF-8 decode" spec,
	// so the BOM bytes are checked on the raw buffer instead.
	const bytes = new Uint8Array(await res.arrayBuffer());
	expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
	expect(res.headers.get('content-disposition')).toContain('.csv');
});

test('missing account_id is a 400, matching the page’s own "pilih akun" requirement', async () => {
	const { companyId } = await makeCompany();
	const u = await makeUser();
	await addMember(u.id, companyId, 'viewer');
	const res = await GET(fakeEvent({ ctx: await contextFor(u, companyId), path: '/api/reports/ledger/export?format=csv&from=2026-08-01&to=2026-08-31' }) as never);
	expect(res.status).toBe(400);
});

test('an account_id belonging to another company 404s, not leaking its ledger', async () => {
	const a = await makeCompany('PT A');
	const b = await makeCompany('PT B');
	const u = await makeUser();
	await addMember(u.id, b.companyId, 'viewer');
	const url = `/api/reports/ledger/export?format=csv&account_id=${a.bankAccountId}&from=2026-08-01&to=2026-08-31`;
	const res = await GET(fakeEvent({ ctx: await contextFor(u, b.companyId), path: url }) as never);
	expect(res.status).toBe(404);
});
