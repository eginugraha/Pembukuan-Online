import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

test('trial balance uses a date range with opening, movement and closing columns', async ({ page }) => {
	await login(page);
	await page.goto('/trial-balance?from=2026-01-01&to=2026-12-31');
	await expect(page.getByRole('group', { name: 'Dari' })).toContainText('01');
	await expect(page.getByRole('group', { name: 'Sampai' })).toContainText('31');
	await expect(page.getByRole('columnheader', { name: 'Saldo Awal' })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: 'Mutasi' })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: 'Saldo Akhir' })).toBeVisible();
	await expect(page.getByText('Balance', { exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Reset' }).click();
	await expect(page).toHaveURL(/\/trial-balance$/);
});

test('a start date after the end date is blocked with a message', async ({ page }) => {
	await login(page);
	await page.goto('/trial-balance?from=2026-01-01&to=2026-01-31');
	const dari = page.getByRole('group', { name: 'Dari' });
	await dari.getByRole('spinbutton').first().click();
	await page.keyboard.type('15022026');
	await expect(dari).toContainText('15');
	await page.getByRole('button', { name: 'Tampilkan' }).click();
	await expect(page.getByText('Tanggal awal harus sebelum tanggal akhir')).toBeVisible();
	await expect(dari).toHaveAttribute('aria-invalid', 'true');
	await expect(page).toHaveURL(/from=2026-01-01&to=2026-01-31$/);
});

test('balance sheet shows a comparative column', async ({ page }) => {
	await login(page);
	await page.goto('/balance-sheet?as_of=2026-12-31');
	await expect(page.getByRole('columnheader', { name: '31 Desember 2026' })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: '31 Desember 2025' })).toBeVisible();
	await expect(page.getByText('JUMLAH ASET', { exact: true })).toBeVisible();
});

test('balance sheet date field follows the URL after client-side Reset', async ({ page }) => {
	await login(page);
	await page.goto('/balance-sheet?as_of=2026-08-31');
	const asOf = page.locator('input[name="as_of"]');
	await expect(asOf).toHaveValue('2026-08-31');
	await page.getByRole('link', { name: 'Reset' }).click();
	await expect(page).toHaveURL(/\/balance-sheet$/);
	await expect(asOf).not.toHaveValue('2026-08-31');
});

test('income statement shows PSAK sections with a comparative period', async ({ page }) => {
	await login(page);
	await page.goto('/income-statement?from=2026-01-01&to=2026-12-31');
	await expect(page.getByRole('link', { name: 'Laba Rugi' })).toBeVisible();
	const table = page.getByRole('table');
	for (const t of ['Pendapatan Usaha', 'Laba Kotor', 'Laba Usaha', 'Laba Sebelum Pajak', 'Laba Bersih'])
		await expect(table.getByRole('cell', { name: t, exact: true })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: /2026/ })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: /2025/ })).toBeVisible();
	await page.getByRole('link', { name: 'Reset' }).click();
	await expect(page).toHaveURL(/\/income-statement$/);
});

test('trial balance can show the state after closing journals', async ({ page }) => {
	await login(page);
	await page.goto('/trial-balance?from=2026-01-01&to=2026-12-31&closing=1');
	await expect(page.getByRole('combobox', { name: 'Jurnal penutup' })).toContainText('Setelah jurnal penutup');
	const reset = page.getByRole('link', { name: 'Reset' });
	await expect(reset).toBeVisible();
	await expect(reset).toHaveAttribute('href', '/trial-balance');
});

test('an inverted range in the URL shows the form with a message instead of an error page', async ({ page }) => {
	await login(page);
	await page.goto('/trial-balance?from=2026-02-01&to=2026-01-01');
	await expect(page.getByText('Tanggal awal harus sebelum tanggal akhir')).toBeVisible();
	await expect(page.getByRole('group', { name: 'Dari' })).toBeVisible();
	await expect(page.getByRole('group', { name: 'Sampai' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Tampilkan' })).toBeVisible();
	await expect(page.getByRole('columnheader', { name: 'Saldo Awal' })).toBeVisible();
});

test('clicking a period caption focuses the first segment of its date field', async ({ page }) => {
	await login(page);
	await page.goto('/trial-balance');
	await page.getByText('Sampai', { exact: true }).click();
	await expect(page.getByRole('group', { name: 'Sampai' }).getByRole('spinbutton').first()).toBeFocused();
});

test.describe('390px layout has no page-level horizontal scroll', () => {
	test.use({ viewport: { width: 390, height: 844 } });
	for (const path of ['/trial-balance', '/balance-sheet', '/income-statement', '/settings/closing']) {
		test(path, async ({ page }) => {
			await login(page);
			await page.goto(path);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
			expect(overflow).toBeLessThanOrEqual(0);
		});
	}
});
