import { expect, test } from 'bun:test';
import { containScale, drawParams } from '../../src/lib/logo-crop';

test('containScale fits the longer axis exactly inside the box', () => {
	expect(containScale(1600, 400, 512)).toBeCloseTo(0.32, 5);
	expect(containScale(400, 1600, 512)).toBeCloseTo(0.32, 5);
	expect(containScale(512, 512, 512)).toBe(1);
});

test('drawParams at zoom=1 letterboxes the shorter axis, centered', () => {
	const d = drawParams(1600, 400, { zoom: 1, panX: 0.5, panY: 0.5 }, 512);
	expect(d.dw).toBeCloseTo(512, 5);
	expect(d.dh).toBeCloseTo(128, 5);
	expect(d.dx).toBeCloseTo(0, 5);
	expect(d.dy).toBeCloseTo(192, 5);
});

test('drawParams pans across overflow once zoom pushes an axis past the box', () => {
	const left = drawParams(1600, 400, { zoom: 2, panX: 0, panY: 0.5 }, 512);
	const right = drawParams(1600, 400, { zoom: 2, panX: 1, panY: 0.5 }, 512);
	expect(left.dw).toBeCloseTo(1024, 5);
	expect(left.dx).toBeCloseTo(0, 5);
	expect(right.dx).toBeCloseTo(-512, 5);
});

test('drawParams keeps the shorter axis centered even while the longer axis is panned', () => {
	const d = drawParams(1600, 400, { zoom: 2, panX: 0.5, panY: 0.5 }, 512);
	expect(d.dh).toBeCloseTo(256, 5);
	expect(d.dy).toBeCloseTo(128, 5);
});
