import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/uploads/new');
});

// A successful submission leaves a real, unconfirmed upload in the shared e2e DB (there is no
// per-spec DB reset — see global-setup.ts). Left alone, that pending batch adds a second
// "Konfirmasi semua saran" group on /review, breaking smoke.spec.ts's strict single-match
// assertion. Delete whatever this test created, same pattern as company-logo.spec.ts's cleanup.
test.afterEach(async ({ page }) => {
	const match = page.url().match(/\/uploads\/([0-9a-f-]{36})$/);
	if (match) await page.request.delete(`/api/uploads/${match[1]}`);
});

test('creates a manual batch with two rows and redirects to its detail page', async ({ page }) => {
	await page.getByRole('tab', { name: 'Input Manual' }).click();
	await page.getByLabel('Nama bank').fill('Mandiri');
	await page.getByLabel('Nomor rekening').fill('1234567890');

	// Baris pertama.
	await page.getByLabel('Keterangan baris 1').fill('Transfer masuk');
	await page.getByLabel('Masuk (Kredit)').first().check();
	await page.getByLabel('Jumlah baris 1').fill('500000');
	await page.locator('[role="spinbutton"]').first().click();
	await page.keyboard.type('08022026');

	// Tambah baris kedua.
	await page.getByRole('button', { name: 'Tambah Baris' }).click();
	await page.getByLabel('Keterangan baris 2').fill('Bayar listrik');
	await page.getByLabel('Keluar (Debit)').last().check();
	await page.getByLabel('Jumlah baris 2').fill('150000');
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

test('an invalid amount on the second row is flagged on that row only, not the first', async ({ page }) => {
	await page.getByRole('tab', { name: 'Input Manual' }).click();
	await page.getByLabel('Nama bank').fill('Mandiri');
	await page.getByLabel('Nomor rekening').fill('1234567890');

	// Baris pertama: valid.
	await page.getByLabel('Keterangan baris 1').fill('Transfer masuk');
	await page.getByLabel('Masuk (Kredit)').first().check();
	await page.getByLabel('Jumlah baris 1').fill('500000');
	await page.locator('[role="spinbutton"]').first().click();
	await page.keyboard.type('08022026');

	// Baris kedua: jumlah tidak valid (0, gagal validasi "lebih dari 0").
	await page.getByRole('button', { name: 'Tambah Baris' }).click();
	await page.getByLabel('Keterangan baris 2').fill('Bayar listrik');
	await page.getByLabel('Keluar (Debit)').last().check();
	await page.getByLabel('Jumlah baris 2').fill('0');
	await page.locator('[role="spinbutton"]').nth(3).click();
	await page.keyboard.type('09022026');

	await page.getByRole('button', { name: 'Simpan' }).click();

	// Tidak pindah halaman: baris 2 yang salah, bukan baris 1.
	await expect(page).toHaveURL(/\/uploads\/new$/);
	await expect(page.getByLabel('Jumlah baris 2')).toHaveAttribute('aria-invalid', 'true');
	await expect(page.getByLabel('Jumlah baris 1')).not.toHaveAttribute('aria-invalid', 'true');
	await expect(page.getByText('Jumlah harus lebih dari 0')).toBeVisible();
});
