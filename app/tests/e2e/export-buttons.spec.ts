import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
});

test('journal page offers Excel and CSV downloads for the active date range', async ({ page }) => {
	await page.goto('/journal?from=2026-08-01&to=2026-08-31');
	const excel = page.getByRole('link', { name: 'Unduh Excel' });
	await expect(excel).toHaveAttribute('href', /format=xlsx&from=2026-08-01&to=2026-08-31/);
	await expect(page.getByRole('link', { name: 'Unduh CSV' })).toHaveAttribute('href', /format=csv/);
});

test('trial balance page offers a PDF download that actually returns a PDF', async ({ page }) => {
	await page.goto('/trial-balance?from=2026-08-01&to=2026-08-31');
	const href = await page.getByRole('link', { name: 'Unduh PDF' }).getAttribute('href');
	const res = await page.request.get(href!);
	expect(res.headers()['content-type']).toBe('application/pdf');
});

test('balance sheet page offers a PDF download with the active as-of date', async ({ page }) => {
	await page.goto('/balance-sheet?as_of=2026-08-31');
	const href = await page.getByRole('link', { name: 'Unduh PDF' }).getAttribute('href');
	expect(href).toMatch(/\/api\/reports\/balance-sheet\/export\?as_of=2026-08-31/);
});

test('income statement page offers a PDF download for the active date range', async ({ page }) => {
	await page.goto('/income-statement?from=2026-08-01&to=2026-08-31');
	const href = await page.getByRole('link', { name: 'Unduh PDF' }).getAttribute('href');
	expect(href).toMatch(/\/api\/reports\/income-statement\/export\?from=2026-08-01&to=2026-08-31/);
});

test('ledger page hides the download buttons until an account is selected', async ({ page }) => {
	await page.goto('/ledger');
	await expect(page.getByRole('link', { name: 'Unduh Excel' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Unduh CSV' })).toHaveCount(0);
});
