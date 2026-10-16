import { expect, test } from 'bun:test';

// Warna wajib lewat token tema (lihat src/app.css); komponen shadcn di src/lib/components/ui dikecualikan.
const FORBIDDEN = /\b(?:text|bg|border|ring)-(?:slate|blue|gray)-\d{2,3}\b/g;

test('pages and app components use theme tokens, not hardcoded slate/blue/gray', async () => {
	const offenders: string[] = [];
	for (const dir of ['src/routes', 'src/lib/components']) {
		for await (const file of new Bun.Glob('**/*.svelte').scan(dir)) {
			if (dir === 'src/lib/components' && file.startsWith('ui/')) continue;
			const hits = (await Bun.file(`${dir}/${file}`).text()).match(FORBIDDEN);
			if (hits) offenders.push(`${dir}/${file}: ${[...new Set(hits)].join(', ')}`);
		}
	}
	expect(offenders).toEqual([]);
});
