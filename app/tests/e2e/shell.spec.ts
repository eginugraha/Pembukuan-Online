import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
});

test('super admin can reach "Perusahaan baru" on a phone', async ({ page }) => {
	await expect(page.getByRole('link', { name: 'Perusahaan baru' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('mobile drawer moves focus in, traps Tab, and restores focus on close', async ({ page }) => {
	const trigger = page.getByRole('button', { name: 'Buka menu' });
	await expect(trigger).toHaveAttribute('aria-expanded', 'false');
	await trigger.click();
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	const drawer = page.getByRole('dialog', { name: 'Menu' });
	await expect(drawer.getByRole('button', { name: 'Tutup menu' })).toBeFocused();

	// Shift+Tab dari elemen pertama harus tetap di dalam drawer.
	await page.keyboard.press('Shift+Tab');
	expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);

	await page.keyboard.press('Escape');
	await expect(drawer).toBeHidden();
	await expect(trigger).toBeFocused();
});
