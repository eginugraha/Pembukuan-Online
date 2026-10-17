import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test.use({ viewport: { width: 1280, height: 720 } });

test('header, sidebar logo and full-width footer stay in place while content scrolls', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.goto('/settings/accounts'); // halaman panjang

	const header = page.getByRole('banner');
	const footer = page.getByRole('contentinfo');
	const logo = page.locator('aside').first().getByRole('link', { name: /Jurnalku/ });
	await expect(footer).toContainText('© 2026 Jurnalku');
	await expect(footer).toContainText(/v\d+\.\d+\.\d+/);
	await expect(footer).toContainText('Data tersimpan di server Anda');

	const before = { header: (await header.boundingBox())!, logo: (await logo.boundingBox())!, footer: (await footer.boundingBox())! };
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await page.waitForTimeout(200);
	expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

	const after = { header: (await header.boundingBox())!, logo: (await logo.boundingBox())!, footer: (await footer.boundingBox())! };
	expect(after.header.y).toBe(before.header.y);
	expect(after.logo.y).toBe(before.logo.y);
	expect(after.footer.y).toBe(before.footer.y);
	// Footer selebar layar dan menempel di bawah viewport.
	expect(after.footer.x).toBe(0);
	expect(after.footer.width).toBe(1280);
	expect(Math.round(after.footer.y + after.footer.height)).toBe(720);
	// Bagian bawah sidebar (Keluar) tetap terlihat di atas footer.
	const logout = page.locator('aside').first().getByRole('button', { name: 'Keluar' });
	const lb = (await logout.boundingBox())!;
	expect(lb.y + lb.height).toBeLessThanOrEqual(after.footer.y);
});
