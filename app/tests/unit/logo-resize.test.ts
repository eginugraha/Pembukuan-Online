import { expect, test } from 'bun:test';
import { fitSize } from '../../src/lib/logo-resize';

test('fitSize keeps the aspect ratio of a wide logo and caps the longer side', () => {
	expect(fitSize(4000, 1000, 1024)).toEqual({ width: 1024, height: 256 });
	expect(fitSize(500, 2000, 1024)).toEqual({ width: 256, height: 1024 });
});

test('fitSize never enlarges a small logo', () => {
	expect(fitSize(300, 80, 1024)).toEqual({ width: 300, height: 80 });
});
