import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

/** Format tanggal hari ini sebagai `DDMMYYYY`, urutan ketik segmen DateField (lihat manual-entry.spec.ts). */
function todayDdmmyyyy(): string {
	const d = new Date();
	return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
}

test('create, revise, approve and unapprove a quotation; old versions are read-only', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	await page.goto('/settings/company');
	await page.getByLabel('Kode perusahaan').fill('E2E');
	await page.getByRole('button', { name: 'Simpan' }).first().click();
	await expect(page.getByText('Data perusahaan disimpan.')).toBeVisible();

	await page.goto('/invoicing/contacts');
	await page.getByRole('button', { name: 'Tambah kontak' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Jenis').click();
	await page.getByRole('option', { name: 'Pelanggan' }).click();
	await dialog.getByLabel('Nama', { exact: true }).fill('PT Klien Penawaran');
	await dialog.getByLabel('Kode', { exact: true }).fill('plg');
	await dialog.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByText('Kontak dibuat.')).toBeVisible();

	// --- Buat penawaran lewat menu ---
	await page.getByRole('link', { name: 'Penawaran' }).first().click();
	await expect(page).toHaveURL(/\/invoicing\/quotations$/);
	await page.getByRole('link', { name: 'Buat Penawaran' }).click();
	await page.getByLabel('Pelanggan').click();
	await page.getByPlaceholder('Cari pelanggan…').fill('PT Klien Penawaran');
	await page.keyboard.press('Enter');
	await page.locator('[role="spinbutton"]').first().click();
	await page.keyboard.type(todayDdmmyyyy());
	await page.getByLabel('Keterangan baris 1').fill('Desain UI');
	await page.getByLabel('Kuantitas baris 1').fill('1');
	await page.getByLabel('Harga satuan baris 1').fill('15000000');
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByRole('heading', { name: /^001\/E2E-PLG\/QUO\/[IVX]+\/\d{4}$/ })).toBeVisible();
	await expect(page.getByText('Menunggu', { exact: true })).toBeVisible();

	// --- Revisi: nomor -R1, versi lama di riwayat berlabel Direvisi ---
	await page.getByRole('link', { name: 'Buat Revisi' }).click();
	await expect(page.getByLabel('Pelanggan')).toBeDisabled();
	await page.getByLabel('Harga satuan baris 1').fill('12000000');
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByRole('heading', { name: /^001\/E2E-PLG\/QUO\/[IVX]+\/\d{4}-R1$/ })).toBeVisible();
	const history = page.getByRole('region', { name: 'Riwayat revisi' });
	await expect(history.getByText('Direvisi')).toBeVisible();

	// --- Versi lama: hanya lihat ---
	await history.getByRole('link', { name: /^001\/E2E-PLG\/QUO\/[IVX]+\/\d{4}$/ }).click();
	await expect(page.getByRole('heading', { name: /^001\/E2E-PLG\/QUO\/[IVX]+\/\d{4}$/ })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Ubah' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Tandai Disetujui' })).toHaveCount(0);
	await page.getByRole('region', { name: 'Riwayat revisi' }).getByRole('link', { name: /-R1$/ }).click();

	// --- Setujui: tombol tulis hilang; batalkan: muncul lagi ---
	await page.getByRole('button', { name: 'Tandai Disetujui' }).click();
	await expect(page.getByText('Disetujui', { exact: true }).first()).toBeVisible();
	await expect(page.getByRole('link', { name: 'Ubah' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Batalkan persetujuan' }).click();
	await expect(page.getByRole('link', { name: 'Ubah' })).toBeVisible();
	await page.getByRole('link', { name: 'Ubah' }).click();
	await expect(page.getByLabel('Pelanggan')).toBeDisabled();

	// --- Daftar hanya menampilkan versi terbaru ---
	await page.goto('/invoicing/quotations');
	await expect(page.getByText(/^001\/E2E-PLG\/QUO\/[IVX]+\/\d{4}-R1$/)).toBeVisible();
	await expect(page.getByText(/^001\/E2E-PLG\/QUO\/[IVX]+\/\d{4}$/)).toHaveCount(0);
});
