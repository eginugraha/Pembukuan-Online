/**
 * Pembatas percobaan login in-memory (per proses). Login memanggil Better Auth dari server
 * sehingga rate limiter HTTP bawaannya tidak berlaku; ini menggantikannya untuk satu instance.
 */
export interface LoginThrottle {
	check(key: string): { allowed: boolean; retryAfterMs: number };
	fail(key: string): void;
	reset(key: string): void;
}

export function createLoginThrottle(opts: {
	maxFailures: number;
	windowMs: number;
	now?: () => number;
}): LoginThrottle {
	const now = opts.now ?? Date.now;
	const failures = new Map<string, { count: number; firstAt: number }>();

	const current = (key: string) => {
		const entry = failures.get(key);
		if (entry && now() - entry.firstAt > opts.windowMs) {
			failures.delete(key);
			return undefined;
		}
		return entry;
	};

	return {
		check(key) {
			const entry = current(key);
			if (!entry || entry.count < opts.maxFailures) return { allowed: true, retryAfterMs: 0 };
			return { allowed: false, retryAfterMs: entry.firstAt + opts.windowMs - now() };
		},
		fail(key) {
			const entry = current(key);
			if (entry) entry.count += 1;
			else failures.set(key, { count: 1, firstAt: now() });
		},
		reset(key) {
			failures.delete(key);
		}
	};
}

export const loginThrottle = createLoginThrottle({ maxFailures: 5, windowMs: 15 * 60 * 1000 });
