import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { db } from './db';
import { authAccount, session, user, verification } from './db/schema';
import { env } from './env';
import { hashPassword, verifyPassword } from './password';

function createAuth() {
	return betterAuth({
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: { user, session, account: authAccount, verification }
	}),
	advanced: { database: { generateId: 'uuid' } },
	emailAndPassword: {
		enabled: true,
		disableSignUp: true, // D3: user hanya dibuat oleh admin
		minPasswordLength: 8,
		password: {
			hash: hashPassword,
			verify: ({ hash, password }) => verifyPassword(password, hash)
		}
	},
	user: {
		additionalFields: {
			isSuperAdmin: { type: 'boolean', defaultValue: false, input: false },
			isActive: { type: 'boolean', defaultValue: true, input: false }
		}
	},
	plugins: [sveltekitCookies(getRequestEvent)]
	});
}

let instance: ReturnType<typeof createAuth> | null = null;

/** Dibuat saat pertama dipakai (bukan saat import) supaya `vite build` tidak butuh env runtime. */
export function getAuth() {
	return (instance ??= createAuth());
}
