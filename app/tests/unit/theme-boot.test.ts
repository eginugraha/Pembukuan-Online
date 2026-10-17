import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// Skrip inline di app.html (jalan sebelum render) dan $lib/theme.ts harus sepakat untuk setiap nilai tersimpan.
const html = readFileSync(new URL('../../src/app.html', import.meta.url), 'utf-8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/)![1];

function runInline(stored: string | null, prefersDark: boolean) {
	const attrs: Record<string, string> = {};
	const classes = new Set<string>();
	const root = {
		classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
		style: { colorScheme: '' },
		dataset: attrs
	};
	new Function('document', 'localStorage', 'window', inline)(
		{ documentElement: root },
		{ getItem: () => stored },
		{ matchMedia: () => ({ matches: prefersDark }) }
	);
	return { dark: classes.has('dark'), theme: attrs.theme, colorScheme: root.style.colorScheme };
}

const g = globalThis as Record<string, unknown>;
afterEach(() => {
	delete g.localStorage;
});

for (const stored of ['dark', 'light', 'system', 'foo', '', null] as const) {
	for (const prefersDark of [true, false]) {
		test(`stored=${JSON.stringify(stored)} prefersDark=${prefersDark}: inline script matches theme.ts`, async () => {
			g.localStorage = { getItem: () => stored };
			const { readTheme } = await import('$lib/theme');
			const mode = readTheme();
			const expectedDark = mode === 'dark' || (mode === 'system' && prefersDark);
			const out = runInline(stored, prefersDark);
			expect(out.theme).toBe(mode);
			expect(out.dark).toBe(expectedDark);
			expect(out.colorScheme).toBe(expectedDark ? 'dark' : 'light');
		});
	}
}
