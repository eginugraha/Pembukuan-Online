import { expect, test } from 'bun:test';
import { barSpecs } from '$lib/stat-bars';

test('bars are scaled by magnitude but keep their sign, so loss months can be coloured differently', () => {
	const bars = barSpecs(['100.00', '-50.00', '0.00', '25.00']);
	expect(bars.map((b) => b.negative)).toEqual([false, true, false, false]);
	expect(bars.map((b) => b.percent)).toEqual([100, 50, 6, 25]);
});

test('an all-zero series still renders a minimal bar per month', () => {
	expect(barSpecs(['0.00', '0.00']).map((b) => b.percent)).toEqual([6, 6]);
});

test('very small non-zero values keep a visible minimum height', () => {
	expect(barSpecs(['1000000.00', '1.00'])[1].percent).toBe(14);
});
