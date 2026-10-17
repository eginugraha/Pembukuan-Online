import { expect, test } from 'bun:test';

test('total rows use the shared rounded .total-row style instead of square row backgrounds', async () => {
	const css = await Bun.file(new URL('../../src/app.css', import.meta.url)).text();
	const block = css.slice(css.indexOf('.total-row'));
	expect(block).toContain('border-top-left-radius');
	expect(block).toContain('border-bottom-right-radius');

	const offenders: string[] = [];
	for await (const f of new Bun.Glob('**/*.svelte').scan('src/routes')) {
		const text = await Bun.file(`src/routes/${f}`).text();
		if (/bg-pale font-bold text-deep hover:bg-pale/.test(text)) offenders.push(f);
	}
	expect(offenders).toEqual([]);
});
