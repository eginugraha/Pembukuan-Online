import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test('login shows the pena brand, tagline and favicon', async ({ page, request }) => {
	await page.goto('/login');
	await expect(page.getByText('pena.', { exact: true })).toBeVisible();
	await expect(page.getByText('Pembukuan Keuangan Online Gratis')).toBeVisible();
	await expect(page).toHaveTitle('Masuk · pena — Pembukuan Keuangan Online Gratis');
	await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', /(^|\/\/[^/]+)\/favicon\.svg$/);

	const svg = await request.get('/favicon.svg');
	expect(svg.status()).toBe(200);
	expect(svg.headers()['content-type']).toContain('image/svg+xml');
	for (const p of ['/favicon-32.png', '/apple-touch-icon.png']) {
		const r = await request.get(p);
		expect(r.status()).toBe(200);
		expect(r.headers()['content-type']).toContain('image/png');
	}
});

test('app pages use "{title} · pena" and no visible Jurnalku remains', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	await page.goto('/trial-balance');
	await expect(page).toHaveTitle('Neraca Saldo · pena');
	await page.goto('/dashboard');
	await expect(page).toHaveTitle('Dashboard · pena');

	for (const p of ['/dashboard', '/settings/opening-balance', '/profile']) {
		await page.goto(p);
		await expect(page.locator('body')).not.toContainText(/Jurnalku/);
	}

	const logo = page.locator('aside').first().getByRole('link', { name: 'pena' });
	await expect(logo).toBeVisible();
	await expect(logo.locator('.icon-tile')).toHaveText('P');
});
