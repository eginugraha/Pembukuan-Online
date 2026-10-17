import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
});

test('report page shows a breadcrumb and Dashboard link works', async ({ page }) => {
	await page.goto('/income-statement');
	const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
	await expect(nav).toContainText('Laporan Keuangan');
	await expect(nav).toContainText('Laba Rugi');
	await expect(nav.locator('[aria-current="page"]')).toHaveText('Laba Rugi');
	await nav.getByRole('link', { name: 'Dashboard' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
});

test('dashboard has no breadcrumb', async ({ page }) => {
	await page.goto('/dashboard');
	await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
});

test('no horizontal scroll at 390px', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await page.goto('/settings/opening-balance');
	await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});
