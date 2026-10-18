import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

const PNG_SMALL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGPIXusARww4OQA8qhAhsk77hwAAAABJRU5ErkJggg==', 'base64');

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/settings/company');
});

test('upload a logo through the crop dialog, see it applied, then remove it', async ({ page }) => {
	await page.getByLabel('Pilih logo perusahaan').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_SMALL });
	await expect(page.getByRole('dialog', { name: 'Atur Logo' })).toBeVisible();
	await page.getByRole('button', { name: 'Gunakan' }).click();
	await expect(page.getByText('Logo perusahaan diperbarui.')).toBeVisible();
	await expect(page.getByRole('img', { name: /[Ll]ogo/ })).toHaveAttribute('src', /\/api\/companies\/[0-9a-f-]{36}\/logo\?v=\d+/);

	await page.getByRole('button', { name: 'Hapus Logo' }).click();
	await expect(page.getByText('Logo perusahaan dihapus.')).toBeVisible();
});

test('cancelling the crop dialog does not upload anything', async ({ page }) => {
	await page.getByLabel('Pilih logo perusahaan').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_SMALL });
	await expect(page.getByRole('dialog', { name: 'Atur Logo' })).toBeVisible();
	await page.getByRole('button', { name: 'Batal' }).click();
	await expect(page.getByRole('dialog', { name: 'Atur Logo' })).toBeHidden();
});

test('an unreadable file shows a friendly error in the dialog', async ({ page }) => {
	await page.getByLabel('Pilih logo perusahaan').setInputFiles({ name: 'rusak.png', mimeType: 'image/png', buffer: Buffer.from('bukan gambar') });
	await expect(page.getByText('Logo tidak bisa dibaca. Coba file lain.')).toBeVisible();
});
