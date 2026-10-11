import { expect, test } from 'bun:test';
import { minRoleForPath, visibleNav } from '$lib/nav';

test('viewer does not see write menus', () => {
	const hrefs = visibleNav('viewer').flatMap((g) => g.items.map((i) => i.href));
	expect(hrefs).toContain('/uploads');
	expect(hrefs).toContain('/trial-balance');
	expect(hrefs).not.toContain('/uploads/new');
	expect(hrefs).not.toContain('/review');
	expect(hrefs).not.toContain('/settings/users');
});

test('accountant sees review and rules but not user management', () => {
	const hrefs = visibleNav('accountant').flatMap((g) => g.items.map((i) => i.href));
	expect(hrefs).toContain('/review');
	expect(hrefs).toContain('/settings/rules');
	expect(hrefs).not.toContain('/settings/users');
});

test('minRoleForPath uses longest prefix', () => {
	expect(minRoleForPath('/uploads')).toBe('viewer');
	expect(minRoleForPath('/uploads/123')).toBe('viewer');
	expect(minRoleForPath('/uploads/new')).toBe('accountant');
	expect(minRoleForPath('/settings/users')).toBe('admin');
	expect(minRoleForPath('/unknown')).toBeNull();
});
