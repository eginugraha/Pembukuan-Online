import { afterEach, expect, test } from 'bun:test';
import { apiFetch, ClientApiError } from '$lib/api-client';

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

test('sends JSON body and returns parsed data', async () => {
	let seen: RequestInit | undefined;
	globalThis.fetch = (async (_url: string, init: RequestInit) => {
		seen = init;
		return Response.json({ ok: true });
	}) as unknown as typeof fetch;
	expect(await apiFetch<{ ok: boolean }>('/api/x', { method: 'POST', json: { a: 1 } })).toEqual({ ok: true });
	expect(seen?.body).toBe('{"a":1}');
	expect((seen?.headers as Record<string, string>)['content-type']).toBe('application/json');
});

test('throws ClientApiError with server message', async () => {
	globalThis.fetch = (async () =>
		Response.json({ error: { code: 'duplicate_statement', message: 'Sudah ada' } }, { status: 409 })) as unknown as typeof fetch;
	await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 409, code: 'duplicate_statement', message: 'Sudah ada' });
	await expect(apiFetch('/api/x')).rejects.toBeInstanceOf(ClientApiError);
});
