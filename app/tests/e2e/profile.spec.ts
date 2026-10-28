import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

// PNG 4×3 piksel hijau yang valid (bisa di-decode createImageBitmap).
const PNG_SMALL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGPIXusARww4OQA8qhAhsk77hwAAAABJRU5ErkJggg==', 'base64');

test('upload and remove a profile photo from the profile menu', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	await page.getByRole('button', { name: 'Menu profil' }).click();
	await page.getByRole('menuitem', { name: 'Profil Saya' }).click();
	await expect(page).toHaveURL(/\/profile$/);

	await page.getByLabel('Pilih foto profil').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_SMALL });
	await expect(page.getByText('Foto profil diperbarui.')).toBeVisible();
	const topBarPhoto = page.getByRole('button', { name: 'Menu profil' }).getByRole('img');
	await expect(topBarPhoto).toHaveAttribute('src', /\/api\/users\/[0-9a-f-]{36}\/avatar\?v=\d+/);
	const src = (await topBarPhoto.getAttribute('src'))!;
	const res = await page.request.get(src);
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toMatch(/^image\/(webp|png)$/);

	await page.getByRole('button', { name: 'Hapus foto' }).click();
	await expect(page.getByText('Foto profil dihapus.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Menu profil' }).getByRole('img')).toHaveCount(0);
});

test('an unreadable image shows a friendly Indonesian error', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/profile');
	await page.getByLabel('Pilih foto profil').setInputFiles({ name: 'rusak.png', mimeType: 'image/png', buffer: Buffer.from('bukan gambar') });
	await expect(page.getByText('Foto tidak bisa dibaca. Coba file lain.')).toBeVisible();
});
