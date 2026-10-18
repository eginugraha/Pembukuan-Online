import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/uploads/new');
});

test('creates a manual batch with two rows and redirects to its detail page', async ({ page }) => {
	await page.getByRole('tab', { name: 'Input Manual' }).click();
	await page.getByLabel('Nama bank').fill('Mandiri');
	await page.getByLabel('Nomor rekening').fill('1234567890');

	// Baris pertama.
	await page.getByLabel('Keterangan').first().fill('Transfer masuk');
	await page.getByLabel('Masuk (Kredit)').first().check();
	await page.locator('input[inputmode="decimal"]').last().fill('500000');
	const firstDateSegments = page.locator('[role="spinbutton"]');
	await firstDateSegments.first().click();
	await page.keyboard.type('08022026');

	// Tambah baris kedua.
	await page.getByRole('button', { name: 'Tambah Baris' }).click();
	await page.getByLabel('Keterangan').last().fill('Bayar listrik');
	await page.getByLabel('Keluar (Debit)').last().check();
	await page.locator('input[inputmode="decimal"]').last().fill('150000');
	await page.locator('[role="spinbutton"]').nth(3).click();
	await page.keyboard.type('09022026');

	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page).toHaveURL(/\/uploads\/[0-9a-f-]{36}$/);
});

test('submitting with no account number shows a field error instead of calling the API', async ({ page }) => {
	await page.getByRole('tab', { name: 'Input Manual' }).click();
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page).toHaveURL(/\/uploads\/new$/);
	await expect(page.getByText('wajib diisi').first()).toBeVisible();
});

test('removing a row keeps at least one, and the remove button disables at one row', async ({ page }) => {
	await page.getByRole('tab', { name: 'Input Manual' }).click();
	await expect(page.getByRole('button', { name: 'Hapus baris 1' })).toBeDisabled();
	await page.getByRole('button', { name: 'Tambah Baris' }).click();
	await expect(page.getByRole('button', { name: 'Hapus baris 1' })).toBeEnabled();
	await page.getByRole('button', { name: 'Hapus baris 2' }).click();
	await expect(page.getByRole('button', { name: 'Hapus baris 1' })).toBeDisabled();
});
