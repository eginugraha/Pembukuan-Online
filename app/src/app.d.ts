import type { AppContext } from '$lib/server/rbac';

declare global {
	/** Versi aplikasi dari package.json (disisipkan oleh vite.config.ts). */
	const __APP_VERSION__: string;

	namespace App {
		interface Locals {
			ctx: AppContext | null;
		}
	}
}

export {};
