import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
});

test('profit & loss chart or empty state is shown, tab title is branded', async ({ page }) => {
	await expect(page).toHaveTitle('Dashboard · pena');
	const chart = page.getByRole('group', { name: /Laba Rugi/ });
	const empty = page.getByText('Belum ada jurnal di tahun buku ini');
	await expect(chart.or(empty).first()).toBeVisible();
});

test('composition toggle switches to revenue', async ({ page }) => {
	const group = page.getByRole('radiogroup', { name: 'Jenis komposisi' });
	await group.getByRole('radio', { name: 'Pendapatan' }).click();
	await expect(group.getByRole('radio', { name: 'Pendapatan' })).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByText('Total pendapatan').or(page.getByText('Belum ada pendapatan di tahun buku ini')).first()).toBeVisible();
});

test('no horizontal scroll at 390px', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await page.reload();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
	expect(overflow).toBe(false);
});

test('month link opens the income statement', async ({ page }) => {
	const link = page.locator('a[href^="/income-statement?from="]').first();
	if ((await link.count()) === 0) test.skip(true, 'no chart month links without journals');
	await link.click();
	await expect(page).toHaveURL(/\/income-statement\?from=/);
});

test('chart text stays readable at 390px', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await page.reload();
	const label = page.locator('svg[role="group"] text', { hasText: /^Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des/ }).first();
	if ((await label.count()) === 0) test.skip(true, 'empty state without journals');
	const size = await label.evaluate((el) => {
		const svg = (el as unknown as SVGTextElement).ownerSVGElement!;
		const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
		return parseFloat(getComputedStyle(el).fontSize) * scale;
	});
	expect(size).toBeGreaterThanOrEqual(10);
	expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
