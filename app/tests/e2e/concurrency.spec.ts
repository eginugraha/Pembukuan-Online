import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

// Regresi: @better-auth/core sempat ter-bundle versi "browser" (polyfill AsyncLocalStorage satu nilai global),
// sehingga request bersamaan saling menimpa konteks sesi dan membalas 500.
test('concurrent authenticated requests all succeed', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	const statuses = await Promise.all(
		Array.from({ length: 30 }, () => page.request.get('/dashboard', { maxRedirects: 0 }).then((r) => r.status()))
	);
	expect(statuses.filter((s) => s !== 200)).toEqual([]);
});
