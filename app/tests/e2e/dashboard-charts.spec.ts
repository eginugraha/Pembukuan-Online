import { expect, test } from '@playwright/test';
import { E2E_CHARTS_EMAIL, E2E_PASSWORD } from '../../playwright.config';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill(E2E_CHARTS_EMAIL);
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
});

test('profit & loss chart or empty state is shown, tab title is branded', async ({ page }) => {
	await expect(page).toHaveTitle('Dashboard · pena');
	await expect(page.getByRole('group', { name: /Laba Rugi/ })).toBeVisible();
});

test('composition toggle switches to revenue', async ({ page }) => {
	const group = page.getByRole('radiogroup', { name: 'Jenis komposisi' });
	await group.getByRole('radio', { name: 'Pendapatan' }).click();
	await expect(group.getByRole('radio', { name: 'Pendapatan' })).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByText('Total pendapatan').or(page.getByText('Belum ada pendapatan di tahun buku ini')).first()).toBeVisible();
});

test('composition toggle is operable with arrow keys (roving tabindex)', async ({ page }) => {
	const group = page.getByRole('radiogroup', { name: 'Jenis komposisi' });
	const beban = group.getByRole('radio', { name: 'Beban' });
	const pendapatan = group.getByRole('radio', { name: 'Pendapatan' });
	await beban.focus();
	await expect(beban).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('ArrowRight');
	await expect(pendapatan).toHaveAttribute('aria-checked', 'true');
	await expect(pendapatan).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(beban).toHaveAttribute('aria-checked', 'true');
	await expect(beban).toBeFocused();
});

test('no horizontal scroll at 390px', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await page.reload();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
	expect(overflow).toBe(false);
});

test('month link opens the income statement', async ({ page }) => {
	const link = page.locator('a[href^="/income-statement?from="]').first();
	await expect(link).toBeVisible();
	await link.click();
	await expect(page).toHaveURL(/\/income-statement\?from=/);
});

test.describe('touch', () => {
	test.use({ hasTouch: true });

	test('first tap on a chart month reveals the tooltip instead of navigating; second tap navigates', async ({ page }) => {
		const link = page.locator('a[href^="/income-statement?from="]').first();
		await expect(link).toBeVisible();
		const box = (await link.boundingBox())!;
		const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

		await page.touchscreen.tap(center.x, center.y);
		await expect(page).toHaveURL(/\/dashboard$/);
		await expect(page.getByText(/^Pendapatan Rp/)).toBeVisible();

		await page.touchscreen.tap(center.x, center.y);
		await expect(page).toHaveURL(/\/income-statement\?from=/);
	});
});

test('chart text stays readable at 390px', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await page.reload();
	const label = page.locator('svg[role="group"] text', { hasText: /^Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des/ }).first();
	await expect(label).toBeVisible();
	const size = await label.evaluate((el) => {
		const svg = (el as unknown as SVGTextElement).ownerSVGElement!;
		const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
		return parseFloat(getComputedStyle(el).fontSize) * scale;
	});
	expect(size).toBeGreaterThanOrEqual(10);
	expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('Laba Tahun Berjalan is formatted as rupiah', async ({ page }) => {
	const value = page.getByText('Laba Tahun Berjalan').locator('xpath=following-sibling::span[1]');
	const text = (await value.innerText()).trim();
	expect(text).toMatch(/^Rp\s?\(?[\d.]+,\d{2}\)?$/);
	expect(text).not.toMatch(/\d+\.\d{2}$/);
});
