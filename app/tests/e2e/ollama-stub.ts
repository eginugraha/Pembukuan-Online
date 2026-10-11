// Pengganti Ollama untuk E2E: CR → 4-2001, DB → 5-3003, confidence 0.9, tanpa keyword.
Bun.serve({
	port: 11999,
	async fetch(req) {
		const body = (await req.json()) as { messages: { content: string }[] };
		const prompt = body.messages.at(-1)?.content ?? '';
		const match = prompt.match(/\[\{"group_id".*\}\]/);
		const groups = match ? (JSON.parse(match[0]) as { group_id: string; arah: string }[]) : [];
		const results = groups.map((g) => ({
			group_id: g.group_id,
			account_code: g.arah === 'CR' ? '4-2001' : '5-3003',
			confidence: 0.9,
			reason: 'stub e2e',
			keyword: null
		}));
		return Response.json({ message: { content: JSON.stringify({ results }) } });
	}
});
console.log('Ollama stub listening on 11999');
