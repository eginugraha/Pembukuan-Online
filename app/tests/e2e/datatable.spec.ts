import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

async function addRule(page: import('@playwright/test').Page, keyword: string) {
	await page.getByLabel('Keyword').fill(keyword);
	await page.getByLabel('Akun tujuan').click();
	await page.getByPlaceholder('Cari kode atau nama akun…').fill('5-2010');
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Tambah' }).click();
}

async function removeRules(page: import('@playwright/test').Page, prefix: string) {
	await page.getByPlaceholder('Cari keyword atau akun…').fill(prefix);
	const info = page.getByTestId('datatable-range');
	for (;;) {
		const rows = page.locator('tbody tr', { hasText: prefix });
		if ((await rows.count()) === 0 || (await info.count()) === 0) break;
		const total = Number((await info.textContent())!.match(/dari (\d+)/)![1]);
		await rows.first().getByRole('button', { name: 'Hapus' }).click();
		await expect(info.filter({ hasText: new RegExp(`dari ${total}$`) })).toHaveCount(0);
	}
}

test('rules table: pagination, search, sort and acting on a row from a later page', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/settings/rules');

	// Spec lain membuat/menghapus rule paralel di perusahaan yang sama; karena itu tabel dipersempit
	// ke rule milik test ini lewat awalan keyword unik, sehingga jumlah bisa dicek persis.
	const info = page.getByTestId('datatable-range');
	const search = page.getByPlaceholder('Cari keyword atau akun…');
	await removeRules(page, 'ZZZ PAGE');
	const total = 13;
	for (let n = 1; n <= total; n++) {
		await search.fill('ZZZ PAGE');
		await addRule(page, `ZZZ PAGE ${String(n).padStart(2, '0')}`);
		await expect(page.getByText('Rule dibuat.')).toBeVisible();
		await expect(info).toHaveText(new RegExp(`dari ${n}$`));
	}
	await expect(info).toHaveText(`1–10 dari ${total}`);
	await expect(page.locator('tbody tr')).toHaveCount(10);

	await page.getByRole('button', { name: 'Halaman 2' }).click();
	await expect(info).toHaveText(`11–${Math.min(20, total)} dari ${total}`);
	await expect(page.locator('tbody tr')).toHaveCount(total - 10);

	// Cari: kembali ke halaman 1, dan menampilkan keadaan kosong bila tidak cocok.
	await search.fill('qqqq');
	await expect(page.getByText('Tidak ada data yang cocok')).toBeVisible();
	await search.fill('ZZZ PAGE 0');
	await expect(page.locator('tbody tr')).toHaveCount(9);
	await search.fill('ZZZ PAGE');
	await expect(info).toHaveText(`1–10 dari ${total}`);

	// Urut: naik lalu turun.
	const kw = page.getByRole('columnheader', { name: /Keyword/ });
	await kw.getByRole('button').click();
	await expect(kw).toHaveAttribute('aria-sort', 'ascending');
	await expect(page.locator('tbody tr').first()).toContainText('ZZZ PAGE 01');
	await kw.getByRole('button').click();
	await expect(kw).toHaveAttribute('aria-sort', 'descending');
	await expect(page.locator('tbody tr').first()).toContainText('ZZZ PAGE 13');
	await kw.getByRole('button').click();
	await expect(kw).toHaveAttribute('aria-sort', 'none');

	// Aksi di halaman 2 mengenai baris yang benar dan total berkurang.
	await page.getByRole('button', { name: 'Halaman 2' }).click();
	const row = page.locator('tbody tr').first();
	const name = (await row.locator('td').first().textContent())!.trim();
	await row.getByRole('button', { name: 'Hapus' }).click();
	await expect(page.getByText('Rule dihapus.')).toBeVisible();
	await expect(info).toHaveText(new RegExp(`dari ${total - 1}$`));
	await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(0);

	await removeRules(page, 'ZZZ PAGE');
});

test('deleting the only row on the last page clamps to the new last page', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/settings/rules');

	const info = page.getByTestId('datatable-range');
	// Filter ke rule milik test ini saja: spec lain membuat/menghapus rule paralel di perusahaan yang sama,
	// sehingga jumlah total tabel tidak stabil.
	const search = page.getByPlaceholder('Cari keyword atau akun…');
	await removeRules(page, 'ZZZ CLAMP'); // sisa dari run yang terhenti
	await search.fill('ZZZ CLAMP');
	// 11 rule: halaman terakhir berisi tepat satu baris.
	const total = 11;
	for (let n = 1; n <= total; n++) {
		await page.getByLabel('Keyword').fill(`ZZZ CLAMP ${n}`);
		await page.getByLabel('Akun tujuan').click();
		await page.getByPlaceholder('Cari kode atau nama akun…').fill('5-2010');
		await page.keyboard.press('Enter');
		await page.getByRole('button', { name: 'Tambah' }).click();
		await expect(page.getByText('Rule dibuat.')).toBeVisible();
		await expect(info).toHaveText(new RegExp(`dari ${n}$`));
	}
	const lastPage = Math.ceil(total / 10);
	// Urut keyword naik agar urutan stabil, lalu ke halaman terakhir (1 baris).
	await page.getByRole('columnheader', { name: /Keyword/ }).getByRole('button').click();
	await page.getByRole('button', { name: `Halaman ${lastPage}` }).click();
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await page.locator('tbody tr').first().getByRole('button', { name: 'Hapus' }).click();

	// Halaman dijepit ke halaman terakhir yang baru: 10 baris, bukan halaman kosong.
	await expect(info).toHaveText(`${(lastPage - 2) * 10 + 1}–${(lastPage - 1) * 10} dari ${total - 1}`);
	await expect(page.locator('tbody tr')).toHaveCount(10);
	await expect(page.getByRole('button', { name: `Halaman ${lastPage - 1}` })).toHaveAttribute('aria-current', 'page');

	// Bersihkan rule uji yang tersisa.
	while ((await page.locator('tbody tr', { hasText: 'ZZZ CLAMP' }).count()) > 0) {
		const before = await page.locator('tbody tr', { hasText: 'ZZZ CLAMP' }).count();
		await page.locator('tbody tr', { hasText: 'ZZZ CLAMP' }).first().getByRole('button', { name: 'Hapus' }).click();
		await expect(page.locator('tbody tr', { hasText: 'ZZZ CLAMP' })).toHaveCount(before - 1);
	}
});
