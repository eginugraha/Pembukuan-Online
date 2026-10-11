import type { AppContext } from '$lib/server/rbac';

declare global {
	namespace App {
		interface Locals {
			ctx: AppContext | null;
		}
	}
}

export {};
