import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

async function createAccount(page: Page, code: string, name: string) {
	await page.goto('/settings/accounts');
	const form = page.locator('form', { has: page.getByRole('button', { name: 'Tambah' }) });
	await form.getByLabel('Akun induk').click();
	await page.getByPlaceholder('Cari kode atau nama akun…').fill('5-2000');
	await page.keyboard.press('Enter');
	await form.getByLabel('Kode').fill(code);
	await form.getByLabel('Nama').fill(name);
	await form.getByRole('button', { name: 'Tambah' }).click();
	await expect(page.getByText('Akun dibuat.')).toBeVisible();
}

const rowOf = (page: Page, code: string) => page.locator('tbody tr', { hasText: code });

test('deleting an unused account asks for confirmation and removes it', async ({ page }) => {
	await login(page);
	await createAccount(page, '5-2098', 'Beban Hapus Uji');
	await page.getByPlaceholder('Cari di tabel akun…').fill('5-2098');
	await rowOf(page, '5-2098').getByRole('button', { name: 'Hapus' }).click();

	const dialog = page.getByRole('dialog', { name: 'Hapus akun' });
	await expect(dialog).toContainText('5-2098');
	await expect(dialog).toContainText('belum dipakai');
	await dialog.getByRole('button', { name: 'Batal' }).click();
	await expect(rowOf(page, '5-2098')).toHaveCount(1);

	await rowOf(page, '5-2098').getByRole('button', { name: 'Hapus' }).click();
	await page.getByRole('dialog', { name: 'Hapus akun' }).getByRole('button', { name: 'Hapus akun' }).click();
	await expect(page.getByText('Akun dihapus.')).toBeVisible();
	await expect(rowOf(page, '5-2098')).toHaveCount(0);
});

test('deleting a used account requires a target and moves its rules there', async ({ page }) => {
	await login(page);
	await createAccount(page, '5-2097', 'Beban Pindah Uji');

	await page.goto('/settings/rules');
	await page.getByLabel('Keyword').fill('ZZZ HAPUS AKUN');
	await page.getByLabel('Akun tujuan').click();
	await page.getByPlaceholder('Cari kode atau nama akun…').fill('5-2097');
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Tambah' }).click();
	await expect(page.getByText('Rule dibuat.')).toBeVisible();

	await page.goto('/settings/accounts');
	await page.getByPlaceholder('Cari di tabel akun…').fill('5-2097');
	await rowOf(page, '5-2097').getByRole('button', { name: 'Hapus' }).click();
	const dialog = page.getByRole('dialog', { name: 'Hapus akun' });
	await expect(dialog).toContainText('1 rule');

	// Tanpa tujuan: ditolak dengan pesan di bawah field.
	await dialog.getByRole('button', { name: 'Hapus akun' }).click();
	await expect(dialog.getByRole('alert')).toContainText('Pilih akun tujuan');

	// Pindah ke kelompok laporan lain (HPP) → peringatan klasifikasi; ke kelompok yang sama → tidak ada.
	await dialog.getByLabel('Pindahkan data ke').click();
	await page.getByPlaceholder('Cari kode atau nama akun…').fill('5-1001');
	await page.keyboard.press('Enter');
	await expect(dialog.getByRole('status')).toContainText('kelompok laporan');
	await dialog.getByLabel('Pindahkan data ke').click();
	await page.getByPlaceholder('Cari kode atau nama akun…').fill('5-2008');
	await page.keyboard.press('Enter');
	await expect(dialog.getByRole('status')).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Hapus akun' }).click();
	await expect(page.getByText('Akun dihapus.')).toBeVisible();

	await page.goto('/settings/rules');
	await page.getByPlaceholder('Cari keyword atau akun…').fill('ZZZ HAPUS AKUN');
	const row = page.locator('tbody tr', { hasText: 'ZZZ HAPUS AKUN' });
	await expect(row).toContainText('5-2008');
	await row.getByRole('button', { name: 'Hapus' }).click();
	await expect(page.getByText('Rule dihapus.')).toBeVisible();
});

test('a failed usage lookup in the delete dialog offers a retry instead of a dead end', async ({ page }) => {
	await login(page);
	await page.goto('/settings/accounts');
	await page.getByPlaceholder('Cari di tabel akun…').fill('5-2001');
	let fail = true;
	await page.route('**/api/accounts/*/usage', (route) => (fail ? route.abort() : route.continue()));
	await rowOf(page, '5-2001').getByRole('button', { name: 'Hapus' }).click();
	const dialog = page.getByRole('dialog', { name: 'Hapus akun' });
	await expect(dialog.getByRole('alert')).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Hapus akun' })).toBeDisabled();
	fail = false;
	await dialog.getByRole('button', { name: 'Coba lagi' }).click();
	await expect(dialog).toContainText('belum dipakai');
	await expect(dialog.getByRole('button', { name: 'Hapus akun' })).toBeEnabled();
	await dialog.getByRole('button', { name: 'Batal' }).click();
});
