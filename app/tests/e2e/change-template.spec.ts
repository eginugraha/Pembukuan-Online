import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, E2E_TEMPLATE_EMAIL } from '../../playwright.config';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill(E2E_TEMPLATE_EMAIL);
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/settings/company');
});

test('switch a General company to the IT template by renaming every conflict', async ({ page }) => {
	await page.getByRole('combobox', { name: 'Template tujuan' }).click();
	await page.getByRole('option', { name: 'Perusahaan IT / Software' }).click();
	await page.getByRole('button', { name: 'Ganti template bagan akun' }).click();
	await expect(page).toHaveURL(/\/settings\/company\/coa-template\?target=it$/);
	await expect(page.getByText('1. Kode bentrok · 25')).toBeVisible();

	const next = page.getByRole('button', { name: /^Lanjut/ });
	await expect(next).toBeDisabled();
	const renames = page.getByLabel(/Ganti nama/);
	const n = await renames.count();
	expect(n).toBe(25);
	for (let i = 0; i < n; i++) await renames.nth(i).check();
	await expect(page.getByText('0 dari 25 belum dipilih')).toBeVisible();

	for (let i = 0; i < 3; i++) await next.click();
	await expect(page.getByText(/25 akun diganti nama/)).toBeVisible();
	await page.getByRole('button', { name: 'Terapkan' }).click();

	await expect(page).toHaveURL(/\/settings\/accounts$/);
	await page.getByRole('searchbox', { name: 'Cari' }).fill('Langganan (SaaS)');
	await expect(page.getByText('Pendapatan Langganan (SaaS)').first()).toBeVisible();
});
