import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { E2E_ENV, FIXTURE_PDF } from '../../playwright.config';

export default async function globalSetup() {
	execFileSync('bun', ['run', 'tests/e2e/reset-db.ts'], { env: { ...process.env, ...E2E_ENV }, stdio: 'inherit' });
	execFileSync('bun', ['run', 'tests/e2e/seed-charts.ts'], { env: { ...process.env, ...E2E_ENV }, stdio: 'inherit' });
	execFileSync('bun', ['run', 'tests/e2e/seed-template.ts'], { env: { ...process.env, ...E2E_ENV }, stdio: 'inherit' });
	mkdirSync('tests/e2e/.tmp', { recursive: true });
	execFileSync('../sidecar/.venv/bin/python', ['-I', '../sidecar/tests/make_fixture.py', FIXTURE_PDF], { stdio: 'inherit' });
}
