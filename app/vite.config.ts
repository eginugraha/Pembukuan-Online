import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Hanya nomor versi yang disisipkan ke bundle klien (bukan seluruh package.json).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: { __APP_VERSION__: JSON.stringify(version) }
});
