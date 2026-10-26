import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

const NAME = 'PT Hapus Uji';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
});

test('super admin deletes a freshly created company after typing its name', async ({ page }) => {
	await page.goto('/settings/company?new=1');
	await page.getByLabel('Nama perusahaan').fill(NAME);
	await page.getByRole('button', { name: 'Buat', exact: true }).click();
	await expect(page).toHaveURL(/\/settings\/company$/);

	// Pembuatan perusahaan mengaktifkannya; pilih manual bila ternyata belum aktif.
	const picker = page.getByRole('combobox', { name: 'Pilih perusahaan' });
	if (!(await picker.innerText()).includes(NAME)) {
		await picker.click();
		await page.getByRole('option', { name: NAME }).click();
		await page.goto('/settings/company');
	}
	await expect(picker).toContainText(NAME);

	await page.getByRole('button', { name: 'Hapus perusahaan' }).click();
	const dialog = page.getByRole('dialog', { name: 'Hapus perusahaan' });
	const confirm = dialog.getByRole('button', { name: 'Hapus permanen' });
	await expect(confirm).toBeDisabled();
	await dialog.getByLabel('Nama perusahaan').fill('PT Salah');
	await expect(confirm).toBeDisabled();
	await dialog.getByLabel('Nama perusahaan').fill(NAME);
	await expect(confirm).toBeEnabled();
	await confirm.click();

	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(picker).not.toContainText(NAME);
	await picker.click();
	await expect(page.getByRole('option', { name: NAME })).toHaveCount(0);
});
