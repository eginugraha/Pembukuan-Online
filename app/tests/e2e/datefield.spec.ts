import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

test('pick a date from the calendar and apply the filter', async ({ page }) => {
	await login(page);
	await page.goto('/trial-balance?as_of=2026-08-15');
	const field = page.getByRole('group', { name: 'Per tanggal' });
	await field.getByRole('button', { name: 'Buka kalender' }).click();
	await expect(page.getByText(/Agustus 2026/i).first()).toBeVisible();
	await page.locator('[data-bits-day]:not([data-outside-month])', { hasText: /^31$/ }).click();
	await expect(field).toContainText('31');
	await page.getByRole('button', { name: 'Tampilkan' }).click();
	await expect(page).toHaveURL(/as_of=2026-08-31/);
});

test('Reset returns the filter page to its defaults (no query)', async ({ page }) => {
	await login(page);
	await page.goto('/journal');
	await expect(page.getByRole('button', { name: 'Reset' })).toBeDisabled();
	await page.goto('/journal?from=2026-08-01&to=2026-08-31');
	await expect(page.getByRole('group', { name: 'Dari' })).toContainText('01');
	await page.getByRole('link', { name: 'Reset' }).click();
	await expect(page).toHaveURL(/\/journal$/);
});

test('opening balance date can be typed, and "Hapus" clears it and triggers validation', async ({ page }) => {
	await login(page);
	await page.goto('/settings/opening-balance');
	const field = page.getByRole('group', { name: 'Tanggal mulai' });
	await field.getByRole('spinbutton').first().click();
	await page.keyboard.type('15082026');
	await expect(field).toContainText('15');
	await field.getByRole('button', { name: 'Buka kalender' }).click();
	await page.getByRole('button', { name: 'Hapus' }).click();
	// Isi satu baris agar tombol Simpan aktif, lalu simpan tanpa tanggal.
	const firstDebit = page.getByLabel(/^Debit /).first();
	const firstCredit = page.getByLabel(/^Kredit /).nth(1);
	await firstDebit.fill('1000');
	await firstCredit.fill('1000');
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByText('Tanggal wajib diisi')).toBeVisible();
});

test('clearing a date on a GET filter falls back to the default range without errors', async ({ page }) => {
	await login(page);
	await page.goto('/journal?from=2026-08-01&to=2026-08-31');
	const dari = page.getByRole('group', { name: 'Dari' });
	await dari.getByRole('button', { name: 'Buka kalender' }).click();
	await page.getByRole('button', { name: 'Hapus' }).click();
	await page.getByRole('button', { name: 'Tampilkan' }).click();
	await expect(page).toHaveURL(/[?&]from=(&|$)/);
	await expect(page.getByRole('heading', { name: 'Jurnal Umum' })).toBeVisible();
	// Server memakai default (awal bulan berjalan), jadi field Dari terisi lagi.
	await expect(dari.getByRole('spinbutton').first()).not.toHaveAttribute('aria-valuetext', 'Empty');
});

test('a half-typed date blocks the filter submit and says so', async ({ page }) => {
	await login(page);
	await page.goto('/journal');
	const dari = page.getByRole('group', { name: 'Dari' });
	await dari.getByRole('button', { name: 'Buka kalender' }).click();
	await page.getByRole('button', { name: 'Hapus' }).click();
	await dari.getByRole('spinbutton').first().focus();
	await page.keyboard.type('12');
	await page.getByRole('heading', { name: 'Jurnal Umum' }).click();
	await expect(page.getByText('Lengkapi tanggal')).toBeVisible();
	await expect(dari).toHaveAttribute('aria-invalid', 'true');
	await page.getByRole('button', { name: 'Tampilkan' }).click();
	await expect(page).toHaveURL(/\/journal$/);
});

test('clicking the "Tanggal mulai" label focuses the first date segment', async ({ page }) => {
	await login(page);
	await page.goto('/settings/opening-balance');
	await page.getByText('Tanggal mulai', { exact: true }).click();
	await expect(page.getByRole('group', { name: 'Tanggal mulai' }).getByRole('spinbutton').first()).toBeFocused();
});

test('leaving a typed date with Tab validates the field (opening balance)', async ({ page }) => {
	await login(page);
	await page.goto('/settings/opening-balance');
	const field = page.getByRole('group', { name: 'Tanggal mulai' });
	await field.getByRole('button', { name: 'Buka kalender' }).click();
	await page.getByRole('button', { name: 'Hapus' }).click();
	await field.getByRole('spinbutton').first().focus();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await expect(page.getByText('Tanggal wajib diisi')).toBeVisible();
});

test('Reset stays disabled while the filter equals its defaults, even with a query string', async ({ page }) => {
	await login(page);
	await page.goto('/journal');
	await page.getByRole('button', { name: 'Tampilkan' }).click();
	await expect(page).toHaveURL(/from=.*to=/);
	await expect(page.getByRole('button', { name: 'Reset' })).toBeDisabled();
	await page.goto('/journal?from=2026-08-01&to=2026-08-31');
	await expect(page.getByRole('link', { name: 'Reset' })).toBeVisible();
});

test.describe('"Hari ini" follows Jakarta, not the visitor timezone', () => {
	// 20:00 UTC tgl 31 Agu = 10:00 tgl 31 Agu di Honolulu, tetapi 03:00 tgl 1 Sep di Jakarta.
	test.use({ timezoneId: 'Pacific/Honolulu' });
	test('the calendar shortcut fills the Jakarta date', async ({ page }) => {
		await login(page);
		await page.clock.setFixedTime(new Date('2026-08-31T20:00:00Z'));
		await page.goto('/settings/opening-balance');
		const field = page.getByRole('group', { name: 'Tanggal mulai' });
		await field.getByRole('button', { name: 'Buka kalender' }).click();
		await page.getByRole('button', { name: 'Hari ini' }).click();
		await expect(field.getByRole('spinbutton').nth(0)).toHaveAttribute('aria-valuetext', '1');
		await expect(field.getByRole('spinbutton').nth(1)).toHaveAttribute('aria-valuetext', '9');
		await expect(field.getByRole('spinbutton').nth(2)).toHaveAttribute('aria-valuetext', '2026');
	});
});
