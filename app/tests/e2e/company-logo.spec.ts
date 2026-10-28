import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

const PNG_SMALL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGPIXusARww4OQA8qhAhsk77hwAAAABJRU5ErkJggg==', 'base64');

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/settings/company');
});

// A test can fail partway through an upload/remove cycle (after the upload, before the removal),
// leaving the logo set. Clean it up unconditionally so a mid-test failure here can't leak logo
// state into other specs (e.g. dashboard-charts.spec.ts's "no logo chip" assertion).
test.afterEach(async ({ page }) => {
	await page.goto('/settings/company');
	const removeButton = page.getByRole('button', { name: 'Hapus Logo' });
	if (await removeButton.isVisible().catch(() => false)) {
		await removeButton.click();
		await expect(page.getByText('Logo perusahaan dihapus.')).toBeVisible();
	}
});

test('upload a non-square logo without cropping, see it applied, then remove it', async ({ page }) => {
	// PNG_SMALL berukuran 4×3: logo tersimpan harus tetap 4×3, tidak dipotong persegi.
	await page.getByLabel('Pilih logo perusahaan').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_SMALL });
	await expect(page.getByText('Logo perusahaan diperbarui.')).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	const img = page.getByRole('img', { name: /[Ll]ogo/ });
	await expect(img).toHaveAttribute('src', /\/api\/companies\/[0-9a-f-]{36}\/logo\?v=\d+/);
	await expect.poll(() => img.evaluate((el: HTMLImageElement) => `${el.naturalWidth}x${el.naturalHeight}`)).toBe('4x3');

	await page.getByRole('button', { name: 'Hapus Logo' }).click();
	await expect(page.getByText('Logo perusahaan dihapus.')).toBeVisible();
});

test('an unreadable file shows a friendly error', async ({ page }) => {
	await page.getByLabel('Pilih logo perusahaan').setInputFiles({ name: 'rusak.png', mimeType: 'image/png', buffer: Buffer.from('bukan gambar') });
	await expect(page.getByText('Logo tidak bisa dibaca. Coba file lain.')).toBeVisible();
});

test('add a signer with a signature image, then delete it', async ({ page }) => {
	await page.getByRole('button', { name: 'Tambah Penandatangan' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Nama').fill('Sari Penanda');
	await dialog.getByLabel('Jabatan').fill('Direktur Utama');
	await dialog.getByLabel('Pilih gambar tanda tangan').setInputFiles({ name: 'ttd.png', mimeType: 'image/png', buffer: PNG_SMALL });
	await dialog.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByText('Sari Penanda', { exact: true })).toBeVisible();
	await expect(page.getByRole('img', { name: 'Tanda tangan Sari Penanda' })).toBeVisible();
	await page.getByRole('button', { name: 'Hapus', exact: true }).first().click();
	await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click();
	await expect(page.getByText('Sari Penanda', { exact: true })).toBeHidden();
});
