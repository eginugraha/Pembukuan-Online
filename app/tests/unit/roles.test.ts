import { expect, test } from 'bun:test';
import { roleAtLeast } from '$lib/roles';

test('roleAtLeast ordering', () => {
	expect(roleAtLeast('admin', 'accountant')).toBe(true);
	expect(roleAtLeast('accountant', 'accountant')).toBe(true);
	expect(roleAtLeast('viewer', 'accountant')).toBe(false);
	expect(roleAtLeast(null, 'viewer')).toBe(false);
});
