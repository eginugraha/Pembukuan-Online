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

	// Koreksi: ubah akun kategori salah satu jurnal; jurnal tetap seimbang.
	await page.goto('/journal?from=2026-08-01&to=2026-08-31');
	const pencil = page.getByRole('button', { name: /^Ubah akun / }).first();
	const oldLabel = (await pencil.getAttribute('aria-label'))!.replace('Ubah akun ', '');
	await pencil.click();
	await page.getByLabel('Akun baru').click();
	await page.getByPlaceholder('Cari kode atau nama akun…').fill('5-2013');
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(page.getByText('5-2013 Beban Konsultan & Profesional').first()).toBeVisible();
	expect(oldLabel).not.toContain('5-2013');

	await page.goto('/trial-balance?as_of=2026-08-31');
	await expect(page.getByText('Balance', { exact: true })).toBeVisible();
});
