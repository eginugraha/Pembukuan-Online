process.env.TZ = 'UTC';
// Selalu pakai DB test, jangan pernah DB dev (Bun sudah memuat app/.env sebelum preload ini).
process.env.DATABASE_URL =
	process.env.TEST_DATABASE_URL ?? 'postgres://jurnalku:jurnalku@localhost:5432/jurnalku_test';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789-test-secret-0123456789';
process.env.BETTER_AUTH_URL ??= 'http://localhost:5173';
