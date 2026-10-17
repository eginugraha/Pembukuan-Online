import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

const isDark = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.classList.contains('dark'));

test('dark is the default, applied before any app JavaScript runs', async ({ page }) => {
	// Blokir seluruh JS aplikasi: hanya skrip inline di app.html yang boleh memasang tema.
	await page.route('**/_app/**/*.js', (route) => route.abort());
	await page.goto('/login');
	expect(await isDark(page)).toBe(true);
	expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
});

test('theme choice applies immediately and persists across reloads', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	expect(await isDark(page)).toBe(true);

	const themes = page.getByRole('radiogroup', { name: 'Tema' });
	await themes.getByRole('radio', { name: 'Terang' }).click();
	expect(await isDark(page)).toBe(false);
	await page.reload();
	expect(await isDark(page)).toBe(false);
	await expect(page.getByRole('radiogroup', { name: 'Tema' }).getByRole('radio', { name: 'Terang' })).toHaveAttribute('aria-checked', 'true');

	await page.emulateMedia({ colorScheme: 'light' });
	await page.getByRole('radiogroup', { name: 'Tema' }).getByRole('radio', { name: 'Sistem' }).click();
	expect(await isDark(page)).toBe(false);
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect.poll(() => isDark(page)).toBe(true);
});
