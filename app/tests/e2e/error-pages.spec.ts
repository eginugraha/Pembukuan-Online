import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

async function login(page: import('@playwright/test').Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

test('anonymous unknown URL shows branded 404 without stack traces', async ({ page }) => {
	const res = await page.goto('/halaman-tidak-ada');
	expect(res?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Kembali ke Dashboard' })).toBeVisible();
	await expect(page).toHaveTitle('404 · Pembukuan Online');
	await expect(page.getByText('Halaman yang Anda cari tidak ada atau sudah dipindahkan.')).toBeVisible();
	expect(await page.locator('body').innerText()).not.toContain('Terjadi kesalahan di server');
	const text = await page.locator('body').innerText();
	expect(text).not.toContain('Error:');
	expect(text).not.toMatch(/\bat \S/);
});

test('in-app 404 keeps the sidebar', async ({ page }) => {
	await login(page);
	await page.goto('/uploads/00000000-0000-4000-8000-000000000000');
	await expect(page.getByRole('heading', { name: /tidak ditemukan/i })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Menu utama' })).toBeVisible();
});

test('logged-in unknown URL shows branded root 404', async ({ page }) => {
	await login(page);
	const res = await page.goto('/halaman-tidak-ada');
	expect(res?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'Halaman tidak ditemukan' })).toBeVisible();
	await expect(page.getByText('Pembukuan Online', { exact: true })).toBeVisible();
	await expect(page.getByText('Halaman yang Anda cari tidak ada atau sudah dipindahkan.')).toBeVisible();
	expect(await page.locator('body').innerText()).not.toContain('Terjadi kesalahan di server');
});
