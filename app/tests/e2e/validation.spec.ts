import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

test('add-account form shows client and server errors under each field', async ({ page }) => {
	await login(page);
	await page.goto('/settings/accounts');
	const form = page.locator('form', { has: page.getByRole('button', { name: 'Tambah' }) });

	// Kirim kosong: semua field divalidasi walau belum disentuh.
	await form.getByRole('button', { name: 'Tambah' }).click();
	const code = form.getByLabel('Kode');
	await expect(form.getByText('Kode wajib diisi')).toBeVisible();
	await expect(form.getByText('Nama wajib diisi')).toBeVisible();
	await expect(form.getByText('Akun induk wajib dipilih')).toBeVisible();
	await expect(code).toHaveAttribute('aria-invalid', 'true');
	const describedBy = await code.getAttribute('aria-describedby');
	await expect(page.locator(`#${describedBy}`)).toHaveText('Kode wajib diisi');

	// Error hilang saat diperbaiki (validasi ulang saat mengetik).
	await code.fill('1-1001');
	await expect(form.getByText('Kode wajib diisi')).toHaveCount(0);

	// Error dari server muncul di bawah field Kode.
	await form.getByLabel('Akun induk').click();
	await page.getByPlaceholder('Cari kode atau nama akun…').fill('1-1000');
	await page.keyboard.press('Enter');
	await form.getByLabel('Nama').fill('Kas Duplikat');
	await form.getByRole('button', { name: 'Tambah' }).click();
	await expect(page.locator(`#${describedBy}`)).toHaveText('Kode akun 1-1001 sudah dipakai');

	// Error server hilang saat nilai field diubah.
	await code.fill('1-1099');
	await expect(page.getByText('Kode akun 1-1001 sudah dipakai')).toHaveCount(0);
});

test('login shows field errors under Email and Password', async ({ page }) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page.getByText('Email wajib diisi')).toBeVisible();
	await expect(page.getByText('Password wajib diisi')).toBeVisible();
	await page.getByLabel('Email').fill('bukan-email');
	await page.getByLabel('Email').blur();
	await expect(page.getByText('Format email tidak valid')).toBeVisible();
	await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
});

test('rule and profile forms show field errors', async ({ page }) => {
	await login(page);
	await page.goto('/settings/rules');
	const ruleForm = page.locator('form', { has: page.getByRole('button', { name: 'Tambah' }) });
	await ruleForm.getByLabel('Keyword').fill('ab');
	await ruleForm.getByRole('button', { name: 'Tambah' }).click();
	await expect(ruleForm.getByText('Keyword rule minimal 3 karakter')).toBeVisible();
	await expect(ruleForm.getByText('Akun wajib dipilih')).toBeVisible();

	await page.goto('/profile');
	await page.getByLabel('Nama').fill('');
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByText('Nama wajib diisi')).toBeVisible();
});

test('login works when fields are filled without input events (browser/password-manager autofill)', async ({ page }) => {
	await page.goto('/login');
	await page.evaluate((pw) => {
		(document.getElementById('email') as HTMLInputElement).value = 'admin@jurnalku.local';
		(document.getElementById('password') as HTMLInputElement).value = pw;
	}, E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
});

test('login field errors are wired to their inputs even without JavaScript', async ({ page }) => {
	await page.route('**/_app/**/*.js', (route) => route.abort());
	await page.goto('/login');
	await page.getByRole('button', { name: 'Masuk' }).click();
	const email = page.getByLabel('Email');
	await expect(email).toHaveAttribute('aria-invalid', 'true');
	const describedBy = await email.getAttribute('aria-describedby');
	await expect(page.locator(`#${describedBy}`)).toHaveText('Email wajib diisi');
	await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
});

test('picking the same rejected upload file twice re-runs the check (input is reset)', async ({ page }) => {
	await login(page);
	await page.goto('/uploads/new');
	const input = page.locator('input[type=file]');
	await input.setInputFiles({ name: 'catatan.txt', mimeType: 'text/plain', buffer: Buffer.from('bukan pdf') });
	await expect(page.getByText('File harus berformat PDF')).toBeVisible();
	expect(await input.evaluate((el: HTMLInputElement) => el.value)).toBe('');
	// Fokus keyboard pada dropzone terlihat (cincin fokus pada label pembungkus).
	await input.focus();
	await page.keyboard.press('Shift+Tab');
	await page.keyboard.press('Tab');
	const ring = await page.locator('label', { has: input }).evaluate((el) => getComputedStyle(el).boxShadow);
	expect(ring).not.toBe('none');
});

test('account codes in the chart of accounts table never wrap', async ({ page }) => {
	await login(page);
	await page.goto('/settings/accounts');
	await page.setViewportSize({ width: 600, height: 800 });
	const ws = await page.locator('tbody tr').first().locator('td').first().evaluate((el) => getComputedStyle(el.firstElementChild ?? el).whiteSpace);
	expect(ws).toBe('nowrap');
});
