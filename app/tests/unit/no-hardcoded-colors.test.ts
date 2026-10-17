import { expect, test } from 'bun:test';

// Warna wajib lewat token tema (lihat src/app.css) agar tema terang & gelap sama-sama benar.
// Komponen shadcn di src/lib/components/ui dikecualikan.
const FORBIDDEN = [
	/\b(?:text|bg|border|ring)-(?:slate|blue|gray)-\d{2,3}\b/g,
	/\bbg-white\b/g,
	/-\[[^\]]*#[0-9a-fA-F]{3,8}[^\]]*\]/g
];

test('pages and app components use theme tokens, not hardcoded colors', async () => {
	const offenders: string[] = [];
	for (const dir of ['src/routes', 'src/lib/components']) {
		for await (const file of new Bun.Glob('**/*.svelte').scan(dir)) {
			if (dir === 'src/lib/components' && file.startsWith('ui/')) continue;
			const text = await Bun.file(`${dir}/${file}`).text();
			const hits = FORBIDDEN.flatMap((re) => text.match(re) ?? []);
			if (hits.length) offenders.push(`${dir}/${file}: ${[...new Set(hits)].join(', ')}`);
		}
	}
	expect(offenders).toEqual([]);
});
