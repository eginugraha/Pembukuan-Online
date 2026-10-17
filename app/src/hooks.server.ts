import { building } from '$app/environment';
import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getAuth } from '$lib/server/auth';
import { COMPANY_COOKIE, resolveContext } from '$lib/server/rbac';
import { assertRuntimeEnv } from '$lib/server/env';
import { resumePendingJobs } from '$lib/server/jobs';

export const init: ServerInit = async () => {
	if (building) return;
	assertRuntimeEnv();
	const resumed = await resumePendingJobs();
	if (resumed > 0) console.log(`Melanjutkan ${resumed} upload yang belum selesai diproses`);
};

const PUBLIC_PATHS = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
	const auth = getAuth();
	event.locals.ctx = null;
	const path = event.url.pathname;

	if (!building && !path.startsWith('/api/auth')) {
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (session && session.user.isActive) {
			event.locals.ctx = await resolveContext(
				{
					id: session.user.id,
					email: session.user.email,
					name: session.user.name,
					isSuperAdmin: session.user.isSuperAdmin,
					image: session.user.image ?? null
				},
				event.cookies.get(COMPANY_COOKIE)
			);
		}
	}

	const isPublic = PUBLIC_PATHS.includes(path) || path.startsWith('/api/');
	if (!event.locals.ctx && !isPublic) redirect(303, '/login');

	return svelteKitHandler({ event, resolve, auth, building });
};
