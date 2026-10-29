import { defineConfig } from '@playwright/test';

export const FIXTURE_PDF = 'tests/e2e/.tmp/statement-sintetis.pdf';
export const E2E_CHARTS_EMAIL = 'grafik@pembukuan.local';
export const E2E_TEMPLATE_EMAIL = 'template@pembukuan.local';
export const E2E_PASSWORD = 'e2e-password-123';
const PORT = 4173;

export const E2E_ENV: Record<string, string> = {
	DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://pembukuan:pembukuan@localhost:5432/pembukuan_test',
	BETTER_AUTH_SECRET: 'e2e-secret-0123456789-e2e-secret-0123456789',
	BETTER_AUTH_URL: `http://localhost:${PORT}`,
	ORIGIN: `http://localhost:${PORT}`,
	PORT: String(PORT),
	BODY_SIZE_LIMIT: '11M',
	SIDECAR_URL: 'http://localhost:8000',
	OLLAMA_URL: 'http://localhost:11999',
	OLLAMA_MODEL: 'stub',
	SEED_ADMIN_EMAIL: 'admin@pembukuan.local',
	SEED_ADMIN_PASSWORD: E2E_PASSWORD
};

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: /.*\.spec\.ts/,
	globalSetup: './tests/e2e/global-setup.ts',
	timeout: 90_000,
	use: { baseURL: `http://localhost:${PORT}` },
	webServer: [
		{ command: 'bun tests/e2e/ollama-stub.ts', port: 11999, reuseExistingServer: false },
		{
			command: 'bun run build && bun ./build/index.js',
			port: PORT,
			env: E2E_ENV,
			timeout: 180_000,
			reuseExistingServer: false
		}
	]
});
