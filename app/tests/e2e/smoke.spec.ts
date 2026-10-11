import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, FIXTURE_PDF } from '../../playwright.config';

test('login → upload → review → journal → balanced trial balance', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	await page.goto('/uploads/new');
	await page.locator('input[type=file]').setInputFiles(FIXTURE_PDF);
	await page.getByRole('button', { name: 'Unggah' }).click();
	await expect(page).toHaveURL(/\/uploads\/[0-9a-f-]{36}$/);
	const detailUrl = page.url();
	await expect(page.getByText('Perlu review')).toBeVisible({ timeout: 30_000 });

	await page.goto('/review');
	await page.getByRole('button', { name: /Konfirmasi semua saran/ }).click();
	await expect(page.getByText('Tidak ada transaksi yang menunggu konfirmasi.')).toBeVisible();

	await page.goto(detailUrl);
	await page.getByRole('button', { name: 'Generate Jurnal' }).click();
	await expect(page.getByText('5 jurnal dibuat')).toBeVisible();

	await page.goto('/trial-balance?as_of=2026-08-31');
	await expect(page.getByText('Balance', { exact: true })).toBeVisible();
});
