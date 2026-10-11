import { expect, test } from 'bun:test';
import { parseWithSidecar } from '../../src/lib/server/uploads/sidecar-client';

const file = new File([new Uint8Array([37, 80, 68, 70])], 'st.pdf', { type: 'application/pdf' });
const fakeFetch = (res: Response | Error) =>
	(async () => {
		if (res instanceof Error) throw res;
		return res;
	}) as unknown as typeof fetch;

test('returns parsed statement on 200', async () => {
	const body = { account_no: '1', period_start: '2026-08-01', period_end: '2026-08-31', opening_balance: '0.00', closing_balance: '0.00', transactions: [] };
	const r = await parseWithSidecar(file, { url: 'http://sc', fetch: fakeFetch(Response.json(body)) });
	expect(r.account_no).toBe('1');
});

test('maps 422 reasons to friendly errors', async () => {
	await expect(
		parseWithSidecar(file, { url: 'http://sc', fetch: fakeFetch(Response.json({ reason: 'checksum_mismatch', detail: 'x' }, { status: 422 })) })
	).rejects.toMatchObject({ status: 422, code: 'pdf_checksum_mismatch' });
	await expect(
		parseWithSidecar(file, { url: 'http://sc', fetch: fakeFetch(Response.json({ reason: 'not_bca' }, { status: 422 })) })
	).rejects.toMatchObject({ status: 422, code: 'pdf_not_bca' });
});

test('network failure and 5xx become 503', async () => {
	await expect(parseWithSidecar(file, { url: 'http://sc', fetch: fakeFetch(new TypeError('refused')) })).rejects.toMatchObject({ status: 503 });
	await expect(parseWithSidecar(file, { url: 'http://sc', fetch: fakeFetch(new Response('x', { status: 500 })) })).rejects.toMatchObject({ status: 503 });
});
