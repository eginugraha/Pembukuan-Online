import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

test.use({ viewport: { width: 1280, height: 720 } });

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

test('sidebar has no profile block and collapses to an icon rail that is remembered', async ({ page }) => {
	await login(page);
	const aside = page.locator('aside').first();
	await expect(aside.getByRole('button', { name: 'Keluar' })).toHaveCount(0);
	await expect(aside.getByRole('link', { name: /Profil Saya/ })).toHaveCount(0);

	// Tombol ciutkan ada di top bar (bukan di sidebar), di sebelah kiri pemilih perusahaan, berupa ikon saja.
	await expect(aside.getByRole('button', { name: /sidebar/ })).toHaveCount(0);
	const toggle = page.getByRole('banner').getByRole('button', { name: 'Ciutkan sidebar' });
	expect((await toggle.innerText()).trim()).toBe('');
	expect((await toggle.boundingBox())!.x).toBeLessThan((await page.getByRole('combobox', { name: 'Pilih perusahaan' }).boundingBox())!.x);
	await toggle.click();
	await expect.poll(async () => Math.round((await aside.boundingBox())!.width)).toBe(64);
	await expect(aside.getByText('Riwayat Upload', { exact: true })).toBeHidden();
	await expect.poll(async () => (await page.getByRole('banner').boundingBox())!.x).toBeLessThan(100);

	// Tooltip muncul saat item difokus dengan keyboard, dan nama item tidak dibaca dua kali.
	const dash = aside.getByRole('link', { name: 'Dashboard' });
	await dash.focus();
	await expect(page.getByRole('tooltip', { name: 'Dashboard' })).toBeVisible();
	await expect(dash).not.toHaveAttribute('aria-describedby', /.+/);

	await page.reload();
	await expect.poll(async () => Math.round((await aside.boundingBox())!.width)).toBe(64);
	await expect(page.getByRole('button', { name: 'Lebarkan sidebar' })).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByRole('button', { name: 'Lebarkan sidebar' })).toHaveAttribute('aria-controls', 'app-sidebar');

	await page.getByRole('button', { name: 'Lebarkan sidebar' }).click();
	await expect.poll(async () => Math.round((await aside.boundingBox())!.width)).toBe(256);
});

test('collapsed state is applied before app JavaScript runs (no width jump on load)', async ({ page }) => {
	await login(page);
	await page.evaluate(() => localStorage.setItem('jk-sidebar', 'collapsed'));
	await page.route('**/_app/**/*.js', (route) => route.abort());
	await page.goto('/dashboard');
	expect(await page.evaluate(() => document.documentElement.dataset.sidebar)).toBe('collapsed');
	expect(Math.round((await page.locator('aside').first().boundingBox())!.width)).toBe(64);
});

test('"Perusahaan baru" is a tidy outline button the same height as the company picker', async ({ page }) => {
	await login(page);
	const btn = page.getByRole('link', { name: 'Perusahaan baru' });
	const box = (await btn.boundingBox())!;
	expect(Math.round(box.height)).toBe(40);
	expect(await btn.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
});

test('the collapse toggle shows the right arrow from the first paint when the rail is collapsed', async ({ page }) => {
	await login(page);
	await page.evaluate(() => localStorage.setItem('jk-sidebar', 'collapsed'));
	await page.route('**/_app/**/*.js', (route) => route.abort());
	await page.goto('/dashboard');
	const toggle = page.getByRole('banner').locator('button[aria-controls="app-sidebar"]');
	// Tanpa JS: hanya ikon "lebarkan" (panah kanan) yang terlihat.
	await expect(toggle.locator('svg:visible')).toHaveCount(1);
	await expect(toggle.locator('svg.lucide-chevrons-right')).toBeVisible();
});

test('the profile button has comfortable left padding', async ({ page }) => {
	await login(page);
	const btn = (await page.getByRole('button', { name: 'Menu profil' }).boundingBox())!;
	const hello = (await page.getByText(/^Halo, /).boundingBox())!;
	expect(hello.x - btn.x).toBeGreaterThanOrEqual(12);
});
