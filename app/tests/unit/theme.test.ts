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
