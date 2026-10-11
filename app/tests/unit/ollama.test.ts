import { expect, test } from 'bun:test';
import { OllamaUnavailableError, suggestAccounts, type AiAccount, type AiGroup } from '../../src/lib/server/categorize/ollama';

const accounts: AiAccount[] = [
	{ code: '5-2010', name: 'Beban Administrasi Bank', type: 'EXPENSE' },
	{ code: '4-1001', name: 'Pendapatan Jasa', type: 'REVENUE' }
];
const groups: AiGroup[] = [
	{ groupId: '1', sample: 'BIAYA TRANSFER', direction: 'DB', amount: '6500.00' },
	{ groupId: '2', sample: 'TRSF DARI PELANGGAN', direction: 'CR', amount: '2500000.00' }
];

type Reply = string | Error | Response;
function fakeFetch(replies: Reply[]) {
	const calls: Array<{ url: string; body: any }> = [];
	const fn = (async (url: string, init: RequestInit) => {
		calls.push({ url, body: JSON.parse(String(init.body)) });
		const r = replies.shift();
		if (r instanceof Error) throw r;
		if (r instanceof Response) return r;
		return new Response(JSON.stringify({ message: { content: r } }), { status: 200 });
	}) as unknown as typeof fetch;
	return { fn, calls };
}
const opts = (f: typeof fetch) => ({ url: 'http://ollama:11434', model: 'qwen2.5:7b', fetch: f });

test('sends JSON-mode chat request and maps valid suggestions', async () => {
	const content = JSON.stringify({
		results: [
			{ group_id: '1', account_code: '5-2010', confidence: 0.92, reason: 'biaya bank', keyword: 'biaya transfer' },
			{ group_id: 2, account_code: '4-1001', confidence: '1.5', reason: 'pelanggan', keyword: 'x' }
		]
	});
	const { fn, calls } = fakeFetch([content]);
	const res = await suggestAccounts(groups, accounts, opts(fn));
	expect(calls[0].url).toBe('http://ollama:11434/api/chat');
	expect(calls[0].body).toMatchObject({ model: 'qwen2.5:7b', stream: false, format: 'json', options: { temperature: 0 } });
	expect(calls[0].body.messages[1].content).toContain('5-2010 | Beban Administrasi Bank | EXPENSE');
	expect(res.ok).toBe(true);
	expect(res.suggestions).toEqual([
		{ groupId: '1', accountCode: '5-2010', confidence: 0.92, reason: 'biaya bank', keyword: 'BIAYA TRANSFER' },
		{ groupId: '2', accountCode: '4-1001', confidence: 1, reason: 'pelanggan', keyword: null }
	]);
});

test('drops unknown codes and unknown groups', async () => {
	const content = JSON.stringify({
		results: [
			{ group_id: '1', account_code: '9-9999', confidence: 0.9, reason: '' },
			{ group_id: '7', account_code: '5-2010', confidence: 0.9, reason: '' },
			{ group_id: '2', account_code: '4-1001', confidence: 0.4, reason: 'ragu' }
		]
	});
	const res = await suggestAccounts(groups, accounts, opts(fakeFetch([content]).fn));
	expect(res.suggestions.map((s) => s.groupId)).toEqual(['2']);
});

test('retries once on invalid JSON, then gives up with ok=false', async () => {
	const good = JSON.stringify({ results: [{ group_id: '1', account_code: '5-2010', confidence: 0.9, reason: 'ok' }] });
	const first = fakeFetch(['bukan json', good]);
	const res1 = await suggestAccounts(groups, accounts, opts(first.fn));
	expect(first.calls).toHaveLength(2);
	expect(res1.ok).toBe(true);

	const second = fakeFetch(['bukan json', '{"results": "salah"}']);
	const res2 = await suggestAccounts(groups, accounts, opts(second.fn));
	expect(res2).toEqual({ ok: false, suggestions: [] });
});

test('retries when every account code is unknown', async () => {
	const bad = JSON.stringify({ results: [{ group_id: '1', account_code: 'X', confidence: 0.9, reason: '' }] });
	const { fn, calls } = fakeFetch([bad, bad]);
	expect(await suggestAccounts(groups, accounts, opts(fn))).toEqual({ ok: false, suggestions: [] });
	expect(calls).toHaveLength(2);
});

test('network error or non-2xx throws OllamaUnavailableError', async () => {
	await expect(suggestAccounts(groups, accounts, opts(fakeFetch([new TypeError('ECONNREFUSED')]).fn))).rejects.toBeInstanceOf(
		OllamaUnavailableError
	);
	await expect(
		suggestAccounts(groups, accounts, opts(fakeFetch([new Response('model not found', { status: 404 })]).fn))
	).rejects.toBeInstanceOf(OllamaUnavailableError);
});
