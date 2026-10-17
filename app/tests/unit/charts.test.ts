import { describe, expect, test } from 'bun:test';
import { barGeometry, donutArcs, linePath, niceMax } from '$lib/charts';

describe('charts', () => {
	test('niceMax', () => {
		expect(niceMax([0, 0])).toBe(1);
		expect(niceMax([1234567])).toBeGreaterThanOrEqual(1234567);
		expect(niceMax([-3000, 10])).toBeGreaterThanOrEqual(3000);
	});
	test('barGeometry draws negatives down from the zero line', () => {
		const [pos, neg] = barGeometry([100, -50], 100, 100);
		expect(pos.h).toBeGreaterThan(0);
		expect(neg.h).toBeGreaterThan(0);
		expect(neg.y).toBeCloseTo(pos.y + pos.h, 5);
	});
	test('barGeometry without negatives sits on the bottom', () => {
		const [a] = barGeometry([50], 100, 100);
		expect(a.y + a.h).toBeCloseTo(100, 5);
		expect(a.h).toBeCloseTo(50, 5);
	});
	test('donutArcs', () => {
		const one = donutArcs([1], 50, 30);
		expect(one).toHaveLength(1);
		expect(one[0].length).toBeGreaterThan(0);
		expect(donutArcs([1, 1], 50, 30)).toHaveLength(2);
		expect(donutArcs([], 50, 30)).toEqual([]);
	});
	test('linePath', () => {
		expect(linePath([1, 2, 3], 100, 50).startsWith('M')).toBe(true);
		expect(linePath([], 100, 50)).toBe('');
		expect(linePath([5], 100, 50).startsWith('M')).toBe(true);
	});
});
