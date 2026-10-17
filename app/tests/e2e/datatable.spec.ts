import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test('rules table: pagination, search, sort and acting on a row from a later page', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/settings/rules');

	const info = page.getByTestId('datatable-range');
	const before = Number((await info.textContent())!.match(/dari (\d+)/)![1]);

	// Rule milik test ini sendiri (diurutkan paling akhir), agar rule sistem tidak tersentuh.
	await page.getByLabel('Keyword').fill('ZZZ UJI TABEL');
	await page.getByLabel('Akun tujuan').click();
	await page.getByPlaceholder('Cari kode atau nama akun…').fill('5-2010');
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Tambah' }).click();
	await expect(page.getByText('Rule dibuat.')).toBeVisible();

	const total = before + 1;
	await expect(info).toHaveText(`1–10 dari ${total}`);
	expect(total).toBeGreaterThan(10);
	await expect(page.locator('tbody tr')).toHaveCount(10);

	await page.getByRole('button', { name: 'Halaman 2' }).click();
	await expect(info).toHaveText(new RegExp(`^11–${Math.min(20, total)} dari ${total}$`));

	// Cari: kembali ke halaman 1, dan menampilkan keadaan kosong bila tidak cocok.
	const search = page.getByPlaceholder('Cari keyword atau akun…');
	await search.fill('BPJS');
	await expect(page.locator('tbody tr')).toHaveCount(2);
	await search.fill('qqqq');
	await expect(page.getByText('Tidak ada data yang cocok')).toBeVisible();
	await search.fill('');

	// Urut: naik lalu turun.
	const kw = page.getByRole('columnheader', { name: /Keyword/ });
	await kw.getByRole('button').click();
	await expect(kw).toHaveAttribute('aria-sort', 'ascending');
	await kw.getByRole('button').click();
	await expect(kw).toHaveAttribute('aria-sort', 'descending');
	await expect(page.locator('tbody tr').first()).toContainText('ZZZ UJI TABEL');
	await kw.getByRole('button').click();
	await expect(kw).toHaveAttribute('aria-sort', 'none');

	// Aksi di halaman terakhir mengenai baris yang benar, dan halaman dijepit bila jadi kosong.
	await search.fill('ZZZ');
	const row = page.locator('tbody tr', { hasText: 'ZZZ UJI TABEL' });
	await row.getByRole('button', { name: 'Hapus' }).click();
	await expect(page.getByText('Rule dihapus.')).toBeVisible();
	await expect(page.getByText('Tidak ada data yang cocok')).toBeVisible();
	await search.fill('');
	await expect(info).toHaveText(`1–10 dari ${total - 1}`);
});

test('deleting the only row on the last page clamps to the new last page', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/settings/rules');

	const info = page.getByTestId('datatable-range');
	const count = async () => Number((await info.textContent())!.match(/dari (\d+)/)![1]);
	// Tambah rule sampai halaman terakhir berisi tepat satu baris.
	let total = await count();
	for (let n = 1; total % 10 !== 1; n++) {
		await page.getByLabel('Keyword').fill(`ZZZ CLAMP ${n}`);
		await page.getByLabel('Akun tujuan').click();
		await page.getByPlaceholder('Cari kode atau nama akun…').fill('5-2010');
		await page.keyboard.press('Enter');
		await page.getByRole('button', { name: 'Tambah' }).click();
		await expect(info).toHaveText(new RegExp(`dari ${total + 1}$`));
		total += 1;
	}
	const lastPage = Math.ceil(total / 10);
	// Urut keyword naik agar rule ZZZ berada di akhir, lalu ke halaman terakhir (1 baris).
	await page.getByRole('columnheader', { name: /Keyword/ }).getByRole('button').click();
	await page.getByRole('button', { name: `Halaman ${lastPage}` }).click();
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await page.locator('tbody tr').first().getByRole('button', { name: 'Hapus' }).click();

	// Halaman dijepit ke halaman terakhir yang baru: 10 baris, bukan halaman kosong.
	await expect(info).toHaveText(`${(lastPage - 2) * 10 + 1}–${(lastPage - 1) * 10} dari ${total - 1}`);
	await expect(page.locator('tbody tr')).toHaveCount(10);
	await expect(page.getByRole('button', { name: `Halaman ${lastPage - 1}` })).toHaveAttribute('aria-current', 'page');

	// Bersihkan rule uji yang tersisa.
	const search = page.getByPlaceholder('Cari keyword atau akun…');
	await search.fill('ZZZ CLAMP');
	while ((await page.locator('tbody tr', { hasText: 'ZZZ CLAMP' }).count()) > 0) {
		const before = await page.locator('tbody tr', { hasText: 'ZZZ CLAMP' }).count();
		await page.locator('tbody tr', { hasText: 'ZZZ CLAMP' }).first().getByRole('button', { name: 'Hapus' }).click();
		await expect(page.locator('tbody tr', { hasText: 'ZZZ CLAMP' })).toHaveCount(before - 1);
	}
});
