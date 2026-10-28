import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'));
const themeAttr = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

test('dark is the default, applied before any app JavaScript runs', async ({ page }) => {
	// Blokir seluruh JS aplikasi: hanya skrip inline di app.html yang boleh memasang tema.
	await page.route('**/_app/**/*.js', (route) => route.abort());
	await page.goto('/login');
	expect(await isDark(page)).toBe(true);
	expect(await themeAttr(page)).toBe('dark');
	expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
});

test('an unknown stored value falls back to dark, like the app code does', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('jk-theme', 'foo'));
	await page.route('**/_app/**/*.js', (route) => route.abort());
	await page.goto('/login');
	expect(await isDark(page)).toBe(true);
	expect(await themeAttr(page)).toBe('dark');
});

test('theme dropdown applies immediately, persists, and follows the system when asked', async ({ page }) => {
	await login(page);
	const select = page.getByRole('combobox', { name: 'Tema' });
	await expect(select).toContainText('Gelap');
	expect(await isDark(page)).toBe(true);

	await select.click();
	await expect(page.getByRole('option')).toHaveText([/Terang/, /Gelap/, /Sistem/]);
	await page.getByRole('option', { name: 'Terang' }).click();
	expect(await isDark(page)).toBe(false);
	expect(await themeAttr(page)).toBe('light');
	await page.reload();
	expect(await isDark(page)).toBe(false);
	await expect(page.getByRole('combobox', { name: 'Tema' })).toContainText('Terang');

	await page.emulateMedia({ colorScheme: 'light' });
	await page.getByRole('combobox', { name: 'Tema' }).click();
	await page.getByRole('option', { name: 'Sistem' }).click();
	expect(await isDark(page)).toBe(false);
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect.poll(() => isDark(page)).toBe(true);
});

test('the dropdown shows the stored theme before app JavaScript runs (no wrong label flash)', async ({ page }) => {
	await login(page);
	await page.evaluate(() => localStorage.setItem('jk-theme', 'light'));
	await page.route('**/_app/**/*.js', (route) => route.abort());
	await page.goto('/dashboard');
	const select = page.getByRole('combobox', { name: 'Tema' });
	await expect(select.getByText('Terang', { exact: true })).toBeVisible();
	await expect(select.getByText('Gelap', { exact: true })).toBeHidden();
});
