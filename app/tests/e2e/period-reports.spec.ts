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
