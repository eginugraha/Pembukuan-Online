import { expect, test } from 'bun:test';
import { allowsWithoutCompany, minRoleForPath, NAV, visibleNav } from '$lib/nav';

test('viewer does not see write menus', () => {
	const hrefs = visibleNav('viewer').flatMap((g) => g.items.map((i) => i.href));
	expect(hrefs).toContain('/uploads');
	expect(hrefs).toContain('/trial-balance');
	expect(hrefs).toContain('/balance-sheet');
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

test('every nav item has an icon', () => {
	expect(NAV.flatMap((g) => g.items).every((i) => typeof i.icon === 'string' && i.icon.length > 0)).toBe(true);
});

test('allowsWithoutCompany lets a company-less super admin reach company and system-user pages', () => {
	expect(allowsWithoutCompany('/settings/company', true)).toBe(true);
	expect(allowsWithoutCompany('/settings/system-users', true)).toBe(true);
	expect(allowsWithoutCompany('/settings/system-users/x', true)).toBe(true);
	expect(allowsWithoutCompany('/profile', false)).toBe(true);
	expect(allowsWithoutCompany('/settings/company', false)).toBe(false);
	expect(allowsWithoutCompany('/ledger', true)).toBe(false);
});

test('system users page is only for super admins, with or without a company', () => {
	const hrefs = (role: Parameters<typeof visibleNav>[0], sa?: boolean) =>
		visibleNav(role, sa).flatMap((g) => g.items.map((i) => i.href));
	expect(hrefs('admin', false)).not.toContain('/settings/system-users');
	expect(hrefs('admin')).not.toContain('/settings/system-users');
	expect(hrefs('admin', true)).toContain('/settings/system-users');
	expect(hrefs(null, true)).toContain('/settings/system-users');
});

test('AR/AP menu is visible to viewer and its sub-paths are guarded', () => {
	const hrefs = visibleNav('viewer').flatMap((g) => g.items.map((i) => i.href));
	expect(hrefs).toContain('/invoicing/ar-ap');
	expect(minRoleForPath('/invoicing/ar-ap')).toBe('viewer');
	expect(minRoleForPath('/invoicing/ar-ap/new')).toBe('viewer');
});
