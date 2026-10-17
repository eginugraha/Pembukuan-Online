import { expect, test } from 'bun:test';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { ApiError, apiHandler, parseJson } from '../../src/lib/server/api';

test('ApiError becomes JSON error response', async () => {
	const res = await apiHandler(async () => {
		throw new ApiError(409, 'duplicate_statement', 'Sudah ada');
	});
	expect(res.status).toBe(409);
	expect(await res.json()).toEqual({ error: { code: 'duplicate_statement', message: 'Sudah ada' } });
});

test('ZodError becomes 400 validation_error', async () => {
	const res = await apiHandler(async () => {
		z.object({ a: z.string() }).parse({});
		return json({});
	});
	expect(res.status).toBe(400);
	expect((await res.json()).error.code).toBe('validation_error');
});

test('unknown error becomes 500 without leaking message', async () => {
	const res = await apiHandler(async () => {
		throw new Error('secret db detail');
	});
	expect(res.status).toBe(500);
	expect(JSON.stringify(await res.json())).not.toContain('secret');
});

test('parseJson rejects non-JSON body', async () => {
	const req = new Request('http://x', { method: 'POST', body: 'not json' });
	await expect(parseJson(req, z.object({}))).rejects.toMatchObject({ status: 400, code: 'invalid_json' });
});

test('a Postgres foreign-key violation (even wrapped as a cause) becomes a friendly 409, not a 500', async () => {
	const { apiHandler } = await import('$lib/server/api');
	const fk = Object.assign(new Error('violates foreign key'), { code: '23503' });
	const res = await apiHandler(async () => {
		throw new Error('Failed query', { cause: fk });
	});
	expect(res.status).toBe(409);
	const body = await res.json();
	expect(body.error.code).toBe('conflict');
	expect(body.error.message).toContain('Muat ulang');
});

test('other unexpected errors are still a 500', async () => {
	const { apiHandler } = await import('$lib/server/api');
	const quiet = console.error;
	console.error = () => {};
	try {
		expect((await apiHandler(async () => { throw new Error('boom'); })).status).toBe(500);
	} finally {
		console.error = quiet;
	}
});
