import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// `vite build` memuat modul server tanpa env runtime. postgres.js baru membuka koneksi saat query
// pertama, jadi placeholder aman saat build; env asli divalidasi saat server start (assertRuntimeEnv).
const url = process.env.DATABASE_URL ?? 'postgres://unset:unset@127.0.0.1:1/unset';

export const client = postgres(url, { max: 10 });
export const db = drizzle(client, { schema });

export type DB = typeof db;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type Executor = DB | Tx;
