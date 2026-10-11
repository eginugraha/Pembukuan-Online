import { z } from 'zod';
import { normalizeKeyword, type Direction } from './rules';

export interface AiAccount {
	code: string;
	name: string;
	type: string;
}
export interface AiGroup {
	groupId: string;
	sample: string;
	direction: Direction;
	amount: string;
}
export interface AiSuggestion {
	groupId: string;
	accountCode: string;
	confidence: number;
	reason: string;
	keyword: string | null;
}
export interface BatchResult {
	ok: boolean;
	suggestions: AiSuggestion[];
}
export interface OllamaOptions {
	url: string;
	model: string;
	fetch?: typeof fetch;
	timeoutMs?: number;
}

export class OllamaUnavailableError extends Error {}

const SYSTEM_PROMPT =
	'Anda adalah asisten akuntan Indonesia. Tugas Anda memilih akun Chart of Accounts yang paling tepat ' +
	'untuk setiap mutasi rekening bank perusahaan. Jawab HANYA dengan JSON yang valid.';

const ResponseSchema = z.object({
	results: z.array(
		z.object({
			group_id: z.coerce.string(),
			account_code: z.coerce.string(),
			confidence: z.coerce.number(),
			reason: z.string().optional().default(''),
			keyword: z.string().nullish()
		})
	)
});

export function buildPrompt(groups: AiGroup[], accounts: AiAccount[]): string {
	const accountList = accounts.map((a) => `${a.code} | ${a.name} | ${a.type}`).join('\n');
	const mutations = JSON.stringify(
		groups.map((g) => ({ group_id: g.groupId, keterangan: g.sample, arah: g.direction, nominal: g.amount }))
	);
	return [
		'Daftar akun (kode | nama | tipe):',
		accountList,
		'',
		'Mutasi rekening (arah DB = uang keluar dari rekening, CR = uang masuk ke rekening):',
		mutations,
		'',
		'Untuk setiap mutasi, kembalikan JSON dengan bentuk persis:',
		'{"results":[{"group_id":"1","account_code":"5-2010","confidence":0.9,"reason":"alasan singkat","keyword":"kata kunci khas"}]}',
		'Aturan:',
		'- account_code WAJIB salah satu kode pada daftar akun.',
		'- confidence 0 sampai 1; beri nilai rendah bila ragu.',
		'- keyword: potongan teks pendek dari keterangan yang khas untuk jenis transaksi ini (bukan nama orang, bukan angka), dipakai sebagai rule otomatis.'
	].join('\n');
}

function clamp(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.min(1, Math.max(0, n));
}

function parseContent(content: unknown) {
	if (typeof content !== 'string') return null;
	try {
		const r = ResponseSchema.safeParse(JSON.parse(content));
		return r.success ? r.data : null;
	} catch {
		return null;
	}
}

export async function suggestAccounts(
	groups: AiGroup[],
	accounts: AiAccount[],
	opts: OllamaOptions
): Promise<BatchResult> {
	const doFetch = opts.fetch ?? fetch;
	const validCodes = new Set(accounts.map((a) => a.code));
	const groupIds = new Set(groups.map((g) => g.groupId));
	const body = JSON.stringify({
		model: opts.model,
		stream: false,
		format: 'json',
		options: { temperature: 0 },
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: buildPrompt(groups, accounts) }
		]
	});

	for (let attempt = 0; attempt < 2; attempt++) {
		let res: Response;
		try {
			res = await doFetch(`${opts.url}/api/chat`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body,
				signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000)
			});
		} catch (e) {
			throw new OllamaUnavailableError(`Ollama tidak dapat dihubungi: ${String(e)}`);
		}
		if (!res.ok) throw new OllamaUnavailableError(`Ollama membalas HTTP ${res.status}`);

		const payload = (await res.json().catch(() => null)) as { message?: { content?: unknown } } | null;
		const parsed = parseContent(payload?.message?.content);
		if (!parsed) continue;

		const suggestions = parsed.results
			.filter((r) => groupIds.has(r.group_id) && validCodes.has(r.account_code))
			.map((r) => ({
				groupId: r.group_id,
				accountCode: r.account_code,
				confidence: clamp(r.confidence),
				reason: r.reason,
				keyword: normalizeKeyword(r.keyword)
			}));
		if (parsed.results.length > 0 && suggestions.length === 0) continue;
		return { ok: true, suggestions };
	}
	return { ok: false, suggestions: [] };
}
