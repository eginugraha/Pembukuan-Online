import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

const login = async (page: import('@playwright/test').Page, email: string, password: string) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Masuk' }).click();
};

test('change password from the profile page, then log in with the new one', async ({ page, context }) => {
	// Pengguna khusus agar admin e2e (dipakai test paralel) tidak berubah.
	const email = `ganti-${Date.now()}@jurnalku.local`;
	await login(page, 'admin@jurnalku.local', E2E_PASSWORD);
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/settings/users');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Nama').fill('Penguji Password');
	await page.getByLabel('Password awal').fill('password-lama-1');
	await page.getByRole('button', { name: 'Tambah', exact: true }).click();
	await expect(page.getByText(email)).toBeVisible();
	await context.clearCookies();

	await login(page, email, 'password-lama-1');
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/profile');

	const submit = page.getByRole('button', { name: 'Ganti password' });
	await page.getByLabel('Password saat ini').fill('salah-salah');
	await page.getByLabel('Password baru', { exact: true }).fill('password-baru-2');
	await page.getByLabel('Konfirmasi password baru').fill('beda-sekali');
	await submit.click();
	await expect(page.getByText('Konfirmasi password tidak sama')).toBeVisible();

	await page.getByLabel('Konfirmasi password baru').fill('password-baru-2');
	await submit.click();
	await expect(page.getByText('Password saat ini salah')).toBeVisible();

	await page.getByLabel('Password saat ini').fill('password-lama-1');
	await submit.click();
	await expect(page.getByText('Password diganti. Perangkat lain dikeluarkan.')).toBeVisible();
	await expect(page.getByLabel('Password saat ini')).toHaveValue('');

	await context.clearCookies();
	await login(page, email, 'password-lama-1');
	await expect(page.getByText(/salah|tidak valid/i).first()).toBeVisible();
	await login(page, email, 'password-baru-2');
	await expect(page).toHaveURL(/\/dashboard$/);
});
