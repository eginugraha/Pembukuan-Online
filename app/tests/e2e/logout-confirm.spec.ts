import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@jurnalku.local');
	await page.getByLabel('Password').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: 'Masuk' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

test('logout asks for confirmation; cancelling keeps the session, confirming ends it', async ({ page }) => {
	await login(page);
	await page.getByRole('button', { name: 'Menu profil' }).click();
	await page.getByRole('menuitem', { name: 'Keluar' }).click();

	const dialog = page.getByRole('dialog', { name: 'Keluar dari Jurnalku?' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Batal' }).click();
	await expect(dialog).toBeHidden();
	await page.goto('/dashboard');
	await expect(page).toHaveURL(/\/dashboard$/);

	await page.getByRole('button', { name: 'Menu profil' }).click();
	await page.getByRole('menuitem', { name: 'Keluar' }).click();
	await page.getByRole('dialog', { name: 'Keluar dari Jurnalku?' }).getByRole('button', { name: 'Keluar' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/dashboard');
	await expect(page).toHaveURL(/\/login$/);
});
