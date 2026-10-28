import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

const EMAIL = 'uji-sistem@pembukuan.local';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
});

// A failure after the user was created (or renamed) must not leave it in the DB, or every rerun
// would fail at the create step with a duplicate email. The email never changes, so match on it.
test.afterEach(async ({ page }) => {
	await page.keyboard.press('Escape').catch(() => {});
	await page.goto('/settings/system-users');
	const leftover = page.getByRole('button', { name: `Hapus ${EMAIL}` });
	if (await leftover.isVisible().catch(() => false)) {
		await leftover.click();
		await page.getByRole('dialog', { name: 'Hapus pengguna' }).getByRole('button', { name: 'Hapus permanen' }).click();
		await expect(page.getByRole('row').filter({ hasText: EMAIL })).toHaveCount(0);
	}
});

test('super admin creates, edits, assigns, and deletes a user', async ({ page }) => {
	await page.goto('/settings/system-users');
	await expect(page.getByRole('heading', { name: 'Semua Pengguna' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Semua Pengguna' })).toBeVisible();

	// Menghapus diri sendiri tidak diizinkan.
	await expect(page.getByRole('button', { name: 'Hapus admin@pembukuan.local' })).toBeDisabled();

	await page.getByLabel('Nama', { exact: true }).first().fill('Uji Sistem');
	await page.getByLabel('Email', { exact: true }).fill(EMAIL);
	await page.getByLabel('Password awal').fill('password-uji-1');
	await page.getByRole('button', { name: 'Tambah', exact: true }).click();
	await expect(page.getByText('Pengguna baru dibuat.')).toBeVisible();
	const row = page.getByRole('row').filter({ hasText: EMAIL });
	await expect(row).toContainText('Uji Sistem');

	// Ubah nama dan password.
	await page.getByRole('button', { name: `Ubah ${EMAIL}` }).click();
	const edit = page.getByRole('dialog', { name: 'Ubah pengguna' });
	await edit.getByLabel('Nama', { exact: true }).fill('Uji Sistem 2');
	await edit.getByLabel('Password baru').fill('password-uji-2');
	await edit.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByText('Pengguna diperbarui.')).toBeVisible();
	await expect(row).toContainText('Uji Sistem 2');

	// Tambah ke perusahaan sebagai Viewer, lalu lepas.
	await page.getByRole('button', { name: `Perusahaan ${EMAIL}` }).click();
	const members = page.getByRole('dialog', { name: 'Perusahaan' });
	await members.getByRole('combobox', { name: 'Tambah ke perusahaan' }).click();
	await page.getByRole('option').first().click();
	await members.getByRole('button', { name: 'Tambah', exact: true }).click();
	await expect(members.getByTestId('membership-row')).toHaveCount(1);
	await expect(members.getByRole('combobox', { name: /^Role di / })).toContainText('Viewer');
	await members.getByRole('button', { name: /^Lepas dari / }).click();
	await expect(members.getByTestId('membership-row')).toHaveCount(0);
	await page.keyboard.press('Escape');

	// Hapus lewat dialog.
	await page.getByRole('button', { name: `Hapus ${EMAIL}` }).click();
	const del = page.getByRole('dialog', { name: 'Hapus pengguna' });
	await expect(del).toContainText('dihapus permanen');
	await del.getByRole('button', { name: 'Hapus permanen' }).click();
	await expect(page.getByText('Pengguna dihapus.')).toBeVisible();
	await expect(page.getByRole('row').filter({ hasText: EMAIL })).toHaveCount(0);
});
