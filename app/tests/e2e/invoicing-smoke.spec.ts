import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

/** Format tanggal hari ini sebagai `DDMMYYYY`, urutan ketik segmen DateField (lihat manual-entry.spec.ts). */
function todayDdmmyyyy(): string {
	const d = new Date();
	const dd = String(d.getDate()).padStart(2, '0');
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	return `${dd}${mm}${d.getFullYear()}`;
}

test('create a contact, create and send an invoice, and see it reflected on the journal page', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	// --- Kontak: form inline di /invoicing/contacts (Task 4) ---
	await page.goto('/invoicing/contacts');
	await page.getByLabel('Jenis').click();
	await page.getByRole('option', { name: 'Pelanggan' }).click();
	await page.getByLabel('Nama').fill('PT Pelanggan E2E');
	await page.getByRole('button', { name: 'Tambah' }).click();
	await expect(page.getByText('Kontak dibuat.')).toBeVisible();
	await expect(page.getByText('PT Pelanggan E2E')).toBeVisible();

	// --- Invoice baru: /invoicing/invoices/new (Task 5) ---
	await page.goto('/invoicing/invoices/new');
	await page.getByLabel('Pelanggan').click();
	await page.getByPlaceholder('Cari pelanggan…').fill('PT Pelanggan E2E');
	await page.keyboard.press('Enter');

	// Tanggal invoice: satu-satunya DateField di halaman ini (segmen diketik seperti manual-entry.spec.ts).
	await page.locator('[role="spinbutton"]').first().click();
	await page.keyboard.type(todayDdmmyyyy());

	await page.getByLabel('Akun piutang usaha').click();
	await page.getByPlaceholder('Cari kode atau nama akun…').fill('1-1003');
	await page.keyboard.press('Enter');

	await page.getByLabel('Keterangan baris 1').fill('Jasa konsultasi E2E');
	await page.getByLabel('Kuantitas baris 1').fill('1');
	await page.getByLabel('Harga satuan baris 1').fill('1000000');
	await page.getByLabel('Akun pendapatan baris 1').click();
	await page.getByPlaceholder('Cari kode atau nama akun…').fill('4-1001');
	await page.keyboard.press('Enter');

	await page.getByRole('button', { name: 'Simpan Draft' }).click();
	await expect(page).toHaveURL(/\/invoicing\/invoices\/[0-9a-f-]{36}$/);

	// --- Kirim invoice: menomori + posting jurnal (Task 6) ---
	await page.getByRole('button', { name: 'Kirim' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Kirim' }).click();
	await expect(page.getByRole('heading', { name: /INV-\d{4}-0001/ })).toBeVisible();

	// --- Jurnal yang terposting terlihat di halaman Jurnal yang sudah ada, tanpa diubah ---
	await page.goto('/journal');
	await expect(page.getByText(/INV-\d{4}-0001/).first()).toBeVisible();
});
