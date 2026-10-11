import { expect, test } from 'bun:test';
import { createLoginThrottle } from '../../src/lib/server/login-throttle';

test('blocks a key after max failures within the window, then frees it after the window', () => {
	let now = 0;
	const t = createLoginThrottle({ maxFailures: 3, windowMs: 60_000, now: () => now });
	for (let i = 0; i < 3; i++) {
		expect(t.check('ip|a@x').allowed).toBe(true);
		t.fail('ip|a@x');
	}
	const blocked = t.check('ip|a@x');
	expect(blocked.allowed).toBe(false);
	expect(blocked.retryAfterMs).toBe(60_000);
	expect(t.check('ip|b@x').allowed).toBe(true); // key lain tidak terpengaruh
	now = 60_001;
	expect(t.check('ip|a@x').allowed).toBe(true);
});

test('successful login resets the counter', () => {
	const t = createLoginThrottle({ maxFailures: 2, windowMs: 60_000, now: () => 0 });
	t.fail('k');
	t.reset('k');
	t.fail('k');
	expect(t.check('k').allowed).toBe(true);
});
