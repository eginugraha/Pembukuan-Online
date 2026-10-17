import { expect, test } from 'bun:test';

const css = (await Bun.file(new URL('../../src/app.css', import.meta.url)).text()).toLowerCase();

test('app.css defines the green palette, flat icon tiles, panel and font', () => {
	for (const s of ['#c0f497', '#3e6e1c', '#6bad40', '#f2ffef', '#dee1e7', '--color-lime', '--color-deep', '.icon-tile', '.icon-tile-solid', '.panel', 'plus jakarta sans']) {
		expect(css).toContain(s);
	}
});

test('icon tiles are flat: no 3D gradient tiles remain', async () => {
	expect(css).not.toContain('.tile-3d');
	const hits: string[] = [];
	for (const dir of ['src/routes', 'src/lib/components']) {
		for await (const f of new Bun.Glob('**/*.svelte').scan(dir)) {
			if ((await Bun.file(`${dir}/${f}`).text()).includes('tile-3d')) hits.push(`${dir}/${f}`);
		}
	}
	expect(hits).toEqual([]);
});

test('dark theme tokens follow the approved palette', () => {
	const dark = css.slice(css.indexOf('.dark {'), css.indexOf('}', css.indexOf('.dark {')));
	for (const s of ['#0e130f', '#151c16', '#1b241c', '#263127', '#e7efe4', '#8d9a8f', '#8fd463', '#ff8a6b', 'color-scheme: dark']) {
		expect(dark).toContain(s);
	}
});

test('selects use a custom chevron inset from the right edge, themed for light and dark', async () => {
	const block = css.slice(css.indexOf('.select-chevron {'), css.indexOf('}', css.indexOf('.select-chevron {')));
	expect(block).toContain('appearance: none');
	expect(block).toContain('background-position: right 0.875rem center');
	expect(block).toContain('padding-right: 2.5rem');
	expect(css).toContain('--select-chevron:');
	const dark = css.slice(css.indexOf('.dark {'), css.indexOf('}', css.indexOf('.dark {')));
	expect(dark).toContain('--select-chevron:');
	const { selectClass } = await import('$lib/ui');
	expect(selectClass).toContain('select-chevron');
	const layout = await Bun.file(new URL('../../src/routes/(app)/+layout.svelte', import.meta.url)).text();
	expect(layout).toMatch(/<select[^>]*class="[^"]*select-chevron/s);
});
