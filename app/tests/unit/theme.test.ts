import { expect, test } from 'bun:test';

const css = (await Bun.file(new URL('../../src/app.css', import.meta.url)).text()).toLowerCase();

test('app.css defines the green 3D palette, utilities and font', () => {
	for (const s of ['#c0f497', '#3e6e1c', '#6bad40', '#f2ffef', '#dee1e7', '--color-lime', '--color-deep', '.tile-3d', '.panel', 'plus jakarta sans']) {
		expect(css).toContain(s);
	}
});
