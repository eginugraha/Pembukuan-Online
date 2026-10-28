import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

// Regresi: View Transition menutup halaman dengan lapisan transisi sehingga menu yang ditunjuk mouse
// kehilangan :hover di tengah navigasi (latar menu menyala → padam → menyala = berkedip).
test('clicking a sidebar link keeps it hovered and never covers the page with a view transition', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
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

// Regresi: saat menu jadi aktif, latar hover-nya dulu memudar sebelum indikator tiba (sorotan padam
// sekejap), dan konten baru masuk dari opacity 0 setelah konten lama hilang (frame kosong).
test('navigating keeps the clicked menu highlighted and never blanks the content', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@pembukuan.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	const link = page.locator('aside nav a', { hasText: 'Buku Besar' });
	await link.hover();
	// Biarkan animasi masuk halaman dan fade-in hover selesai dulu.
	await page.waitForTimeout(500);
	await page.evaluate(() => {
		const a = [...document.querySelectorAll<HTMLAnchorElement>('aside nav a')].find((x) => x.textContent?.trim() === 'Buku Besar')!;
		const w = window as unknown as { __samples: { lit: boolean; opacity: number }[] };
		w.__samples = [];
		const t0 = performance.now();
		const tick = () => {
			const ar = a.getBoundingClientRect();
			const ir = document.querySelector<HTMLElement>('aside nav .nav-indicator')?.getBoundingClientRect();
			const covered = ir ? Math.max(0, Math.min(ar.bottom, ir.bottom) - Math.max(ar.top, ir.top)) / ar.height : 0;
			const bg = getComputedStyle(a).backgroundColor;
			const bgAlpha = Number((/\/\s*([\d.e-]+)\)$/.exec(bg) ?? /,\s*([\d.e-]+)\)$/.exec(bg))?.[1] ?? 1);
			const content = document.querySelector<HTMLElement>('main .page-enter');
			// Menu dianggap tersorot bila latarnya sendiri masih terlihat atau indikator sudah menutupinya.
			w.__samples.push({ lit: covered >= 0.5 || bgAlpha >= 0.03, opacity: content ? Number(getComputedStyle(content).opacity) : 1 });
			if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await link.click();
	await expect(page).toHaveURL(/\/ledger$/);
	await page.waitForTimeout(1600);
	const samples = await page.evaluate(() => (window as unknown as { __samples: { lit: boolean; opacity: number }[] }).__samples);
	expect(samples.length).toBeGreaterThan(20);
	expect(samples.filter((s) => !s.lit)).toEqual([]);
	expect(Math.min(...samples.map((s) => s.opacity))).toBeGreaterThanOrEqual(0.5);
});
