process.env.TZ = 'UTC';
// Selalu pakai DB test, jangan pernah DB dev (Bun sudah memuat ../.env lewat --env-file sebelum preload ini).
process.env.DATABASE_URL =
	process.env.TEST_DATABASE_URL ?? 'postgres://pembukuan:pembukuan@localhost:5432/pembukuan_test';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789-test-secret-0123456789';
process.env.BETTER_AUTH_URL ??= 'http://localhost:5173';
