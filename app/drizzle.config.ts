import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle/migrations',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://pembukuan:pembukuan@localhost:5432/pembukuan' }
});
