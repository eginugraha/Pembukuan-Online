import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

// Regresi: View Transition menutup halaman dengan lapisan transisi sehingga menu yang ditunjuk mouse
// kehilangan :hover di tengah navigasi (latar menu menyala → padam → menyala = berkedip).
test('clicking a sidebar link keeps it hovered and never covers the page with a view transition', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	const link = page.locator('aside nav a', { hasText: 'Buku Besar' });
	await link.hover();
	await page.evaluate(() => {
		const a = [...document.querySelectorAll<HTMLAnchorElement>('aside nav a')].find((x) => x.textContent?.trim() === 'Buku Besar')!;
		const w = window as unknown as { __samples: { hover: boolean; vt: boolean }[] };
		w.__samples = [];
		const t0 = performance.now();
		const tick = () => {
			w.__samples.push({ hover: a.matches(':hover'), vt: document.documentElement.matches(':active-view-transition') });
			if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await link.click();
	await expect(page).toHaveURL(/\/ledger$/);
	await page.waitForTimeout(1300);
	const samples = await page.evaluate(() => (window as unknown as { __samples: { hover: boolean; vt: boolean }[] }).__samples);
	expect(samples.length).toBeGreaterThan(20);
	expect(samples.filter((s) => s.vt)).toEqual([]);
	expect(samples.filter((s) => !s.hover)).toEqual([]);
});
