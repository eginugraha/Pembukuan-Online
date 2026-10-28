import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

test('searchable account dropdown: search, highlight, keyboard select, empty state', async ({ page }) => {
	await login(page);
	await page.goto('/settings/accounts');
	const trigger = page.getByLabel('Akun induk');
	await expect(trigger).toHaveAttribute('role', 'combobox');
	await trigger.click();

	const search = page.getByPlaceholder('Cari kode atau nama akun…');
	await expect(search).toBeFocused();
	await search.fill('kas');
	const options = page.getByRole('option');
	await expect(options.first()).toContainText('Kas');
	await expect(page.locator('[role=option] mark').first()).toHaveText(/kas/i);
	// Dikelompokkan per tipe akun.
	await expect(page.getByText('Aset', { exact: true }).first()).toBeVisible();

	await search.fill('zzzz');
	await expect(page.getByText('Tidak ada akun yang cocok')).toBeVisible();

	await search.fill('1-1000');
	await page.keyboard.press('Enter');
	await expect(trigger).toContainText('1-1000');
	await expect(trigger).toContainText('Aset Lancar');
	await expect(search).toBeHidden();
});

test('simple dropdown shows options with the current one checked', async ({ page }) => {
	await login(page);
	await page.goto('/settings/users');
	const role = page.getByLabel('Role', { exact: true });
	await expect(role).toContainText('Viewer');
	await role.click();
	await expect(page.getByRole('option', { name: 'Viewer' })).toHaveAttribute('aria-selected', 'true');
	await page.getByRole('option', { name: 'Akuntan' }).click();
	await expect(role).toContainText('Akuntan');
});

test('opening a dropdown does not flag it invalid; closing without a choice does', async ({ page }) => {
	await login(page);
	await page.goto('/settings/rules');
	const trigger = page.getByLabel('Akun tujuan');
	await trigger.click();
	await expect(page.getByPlaceholder('Cari kode atau nama akun…')).toBeFocused();
	await expect(page.getByText('Akun wajib dipilih')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page.getByText('Akun wajib dipilih')).toBeVisible();
	await expect(trigger).toBeFocused();
});
