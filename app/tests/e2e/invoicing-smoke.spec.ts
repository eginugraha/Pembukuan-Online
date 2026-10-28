import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';
import { todayIso } from '../../src/lib/dates';

/** Format tanggal hari ini sebagai `DDMMYYYY`, urutan ketik segmen DateField (lihat manual-entry.spec.ts). */
function todayDdmmyyyy(): string {
	const d = new Date();
	const dd = String(d.getDate()).padStart(2, '0');
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	return `${dd}${mm}${d.getFullYear()}`;
}

async function setCompanyCode(page: import('@playwright/test').Page) {
	await page.goto('/settings/company');
	await page.getByLabel('Kode perusahaan').fill('E2E');
	await page.getByRole('button', { name: 'Simpan' }).first().click();
	await expect(page.getByText('Data perusahaan disimpan.')).toBeVisible();
}

test('create a contact, then create, edit, and delete an invoice without touching the journal', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await setCompanyCode(page);

	// --- Kontak: dialog "Tambah kontak" ---
	await page.goto('/invoicing/contacts');
	await page.getByRole('button', { name: 'Tambah kontak' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Jenis').click();
	await page.getByRole('option', { name: 'Pelanggan' }).click();
	await dialog.getByLabel('Nama', { exact: true }).fill('PT Pelanggan E2E');
	await dialog.getByLabel('Attention (untuk siapa)').fill('Budi Santoso');
	await dialog.getByLabel('Posisi').fill('Manajer Keuangan');
	await dialog.getByLabel('Alamat').fill('Jl. Contoh 1');
	await dialog.getByLabel('Alamat').press('Enter');
	await dialog.getByLabel('Alamat').pressSequentially('Kota Bandung');
	await expect(dialog.getByLabel('Alamat')).toHaveValue('Jl. Contoh 1\nKota Bandung');
	await dialog.getByLabel('Kode', { exact: true }).fill('plg');
	await dialog.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByText('Kontak dibuat.')).toBeVisible();
	await expect(page.getByText('PT Pelanggan E2E')).toBeVisible();

	// --- Kontak tanpa kode: peringatan dan Simpan nonaktif ---
	await page.getByRole('button', { name: 'Tambah kontak' }).click();
	await dialog.getByLabel('Jenis').click();
	await page.getByRole('option', { name: 'Pelanggan' }).click();
	await dialog.getByLabel('Nama', { exact: true }).fill('PT Tanpa Kode E2E');
	await dialog.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByText('PT Tanpa Kode E2E')).toBeVisible();
	await page.goto('/invoicing/invoices/new');
	await page.getByLabel('Pelanggan').click();
	await page.getByPlaceholder('Cari pelanggan…').fill('PT Tanpa Kode E2E');
	await page.keyboard.press('Enter');
	await expect(page.getByText('Kontak ini belum punya kode.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Simpan' })).toBeDisabled();

	// --- Invoice baru: tanpa akun, nomor langsung dibuat ---
	await page.goto('/invoicing/invoices/new');
	await page.getByLabel('Pelanggan').click();
	await page.getByPlaceholder('Cari pelanggan…').fill('PT Pelanggan E2E');
	await page.keyboard.press('Enter');
	await page.locator('[role="spinbutton"]').first().click();
	await page.keyboard.type(todayDdmmyyyy());
	await page.getByLabel('Perihal').fill('Perihal E2E');
	await page.getByLabel('Catatan (opsional)').fill('Baris satu');
	await page.getByLabel('Catatan (opsional)').press('Enter');
	await page.getByLabel('Catatan (opsional)').pressSequentially('Baris dua');
	// Format: tebal lewat toolbar, lalu daftar poin.
	await page.getByRole('button', { name: /^Tebal/ }).click();
	await page.keyboard.type(' tebal');
	await page.getByRole('button', { name: /^Tebal/ }).click();
	await page.getByLabel('Catatan (opsional)').press('Enter');
	await page.getByRole('button', { name: 'Daftar poin' }).click();
	await page.keyboard.type('butir satu');
	await page.getByLabel('Catatan (opsional)').press('Enter');
	await page.keyboard.type('butir anak');
	await page.getByRole('button', { name: 'Tambah indentasi' }).click();
	await page.getByLabel('Keterangan baris 1').fill('Jasa konsultasi E2E');
	await page.getByLabel('Kuantitas baris 1').fill('1');
	await page.getByLabel('Harga satuan baris 1').fill('1000000');
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page).toHaveURL(/\/invoicing\/invoices\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('heading', { name: /^001\/E2E-PLG\/INV\/[IVX]+\/\d{4}$/ })).toBeVisible();
	await expect(page.getByText('Perihal E2E')).toBeVisible();
	// Catatan multi-baris: Enter menambah baris, bukan mengirim form.
	await expect(page.locator('.rich-notes p', { hasText: 'Baris satu' })).toBeVisible();
	await expect(page.locator('.rich-notes p', { hasText: 'Baris dua' })).toBeVisible();
	await expect(page.locator('.rich-notes strong')).toHaveText('tebal');
	await expect(page.locator('.rich-notes > ul > li').first()).toContainText('butir satu');
	// Indentasi: butir kedua menjadi anak butir pertama.
	await expect(page.locator('.rich-notes ul ul li')).toHaveText('butir anak');
	await expect(page.getByText('Attn: Budi Santoso, Manajer Keuangan')).toBeVisible();

	// --- Ubah: ganti keterangan baris, nomor tetap ---
	await page.getByRole('link', { name: 'Ubah' }).click();
	await expect(page.getByLabel('Mata uang')).toHaveText(/IDR/);
	await page.getByLabel('Mata uang').click();
	await page.getByRole('option', { name: 'USD' }).click();
	await page.getByLabel('Keterangan baris 1').fill('Jasa konsultasi E2E (revisi)');
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByText('Jasa konsultasi E2E (revisi)')).toBeVisible();
	// Mata uang USD: nominal tampil gaya dolar (1 × 1.000.000 → $1,000,000.00).
	await expect(page.getByText('$1,000,000.00').first()).toBeVisible();
	await expect(page.getByRole('heading', { name: /^001\/E2E-PLG\/INV\/[IVX]+\/\d{4}$/ })).toBeVisible();

	// --- Payment Receipt: terbitkan dari halaman detail ---
	const invoiceUrl = page.url();
	const invoiceId = invoiceUrl.split('/').pop();
	await page.getByRole('button', { name: 'Terbitkan Receipt' }).click();
	const receiptDialog = page.getByRole('dialog');
	// Tanggal pembayaran default = hari ini (segmen pertama = hari).
	await expect(receiptDialog.locator('[role="spinbutton"]').first()).toHaveAttribute('aria-valuenow', String(Number(todayIso().slice(8, 10))));
	await receiptDialog.getByRole('button', { name: 'Simpan' }).click();
	// Nomor tampil di kartu hanya bila POST berhasil (dialog menutup diam-diam saat gagal).
	await expect(page.getByText(/^001\/E2E-PLG\/RCP\/[IVX]+\/\d{4}$/)).toBeVisible();
	await expect(page.getByRole('link', { name: 'Unduh PDF Receipt' })).toHaveAttribute('href', `/api/invoicing/invoices/${invoiceId}/receipt/pdf`);
	await expect(page.getByText('Receipt sudah terbit.')).toBeVisible();

	// Invoice yang punya receipt tidak bisa dihapus.
	await page.goto('/invoicing/invoices');
	await expect(page.getByText('Terbit', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Hapus' }).first().click();
	await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click();
	await expect(page.getByText('Hapus receipt terlebih dahulu')).toBeVisible();

	// Hapus receipt lewat dialog di halaman detail.
	await page.goto(invoiceUrl);
	await page.getByRole('button', { name: 'Hapus Receipt' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click();
	await expect(page.getByRole('button', { name: 'Terbitkan Receipt' })).toBeVisible();
	await expect(page.getByText('Receipt sudah terbit.')).toHaveCount(0);

	// --- Invoice tidak masuk Jurnal Umum ---
	await page.goto('/journal');
	await expect(page.getByText(/001\/E2E-PLG\/INV\//)).toHaveCount(0);

	// --- Hapus dari daftar ---
	await page.goto('/invoicing/invoices');
	await expect(page.getByText(/001\/E2E-PLG\/INV\//)).toBeVisible();
	await page.getByRole('button', { name: 'Hapus' }).first().click();
	await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click();
	await expect(page.getByText('Invoice dihapus.')).toBeVisible();
	await expect(page.getByText(/001\/E2E-PLG\/INV\//)).toHaveCount(0);
});

test('create, edit, and delete a purchase order', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await setCompanyCode(page);

	await page.goto('/invoicing/contacts');
	await page.getByRole('button', { name: 'Tambah kontak' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Jenis').click();
	await page.getByRole('option', { name: 'Vendor' }).click();
	await dialog.getByLabel('Nama', { exact: true }).fill('PT Pemasok E2E');
	await dialog.getByLabel('Kode', { exact: true }).fill('PMS');
	await dialog.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByText('Kontak dibuat.')).toBeVisible();

	await page.goto('/invoicing/purchase-orders/new');
	await page.getByLabel('Pemasok').click();
	await page.getByPlaceholder('Cari pemasok…').fill('PT Pemasok E2E');
	await page.keyboard.press('Enter');
	await page.locator('[role="spinbutton"]').first().click();
	await page.keyboard.type(todayDdmmyyyy());
	await page.getByLabel('Perihal').fill('Perihal PO E2E');
	await page.getByLabel('Mata uang').click();
	await page.getByRole('option', { name: 'USD' }).click();
	await page.getByLabel('Keterangan baris 1').fill('Sewa server E2E');
	await page.getByLabel('Kuantitas baris 1').fill('2');
	await page.getByLabel('Harga satuan baris 1').fill('500');
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page).toHaveURL(/\/invoicing\/purchase-orders\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('heading', { name: /^001\/E2E-[A-Z0-9]+\/PO\// })).toBeVisible();
	await expect(page.getByText('Perihal PO E2E')).toBeVisible();
	// Mata uang USD: 2 × 500 → $1,000.00.
	await expect(page.getByText('$1,000.00').first()).toBeVisible();

	await page.getByRole('link', { name: 'Ubah' }).click();
	await page.getByLabel('Keterangan baris 1').fill('Sewa server E2E (revisi)');
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByText('Sewa server E2E (revisi)')).toBeVisible();

	await page.goto('/invoicing/purchase-orders');
	await page.getByRole('button', { name: 'Hapus' }).first().click();
	await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click();
	await expect(page.getByText('Purchase order dihapus.')).toBeVisible();
	await expect(page.getByText(/001\/E2E-[A-Z0-9]+\/PO\//)).toHaveCount(0);
});
