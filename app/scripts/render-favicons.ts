// Skrip sekali jalan: render static/favicon.svg ke PNG (favicon-32.png, apple-touch-icon.png).
// Jalankan: bun run scripts/render-favicons.ts. Hasil PNG di-commit.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const svg = readFileSync(resolve('static/favicon.svg'), 'utf8');
const targets = [
	{ file: 'static/favicon-32.png', size: 32 },
	{ file: 'static/apple-touch-icon.png', size: 180 }
];

const browser = await chromium.launch();
for (const { file, size } of targets) {
	const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
	await page.setContent(
		`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
	);
	await page.screenshot({ path: resolve(file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
	await page.close();
}
await browser.close();
