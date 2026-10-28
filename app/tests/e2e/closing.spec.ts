import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

// Keterbatasan: membuat perusahaan baru lewat UI mengganggu test paralel lain (perusahaan aktif admin berganti),
// dan e2e tidak punya cara membuat jurnal non-OPENING tanpa upload PDF. Maka e2e hanya menguji menu dan halaman;
// alur tutup/buka diuji di tests/integration/closing-api.test.ts.
test('admin sees the Tutup Buku menu and page', async ({ page }) => {
	await login(page);
	await page.getByRole('link', { name: 'Tutup Buku' }).click();
	await expect(page).toHaveURL(/\/settings\/closing$/);
	await expect(page.getByRole('heading', { name: 'Tutup Buku' })).toBeVisible();
	await expect(page.getByText('Tutup tahun buku yang sudah selesai agar jurnalnya terkunci.')).toBeVisible();
});
