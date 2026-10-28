import { building } from '$app/environment';
import { redirect, type Handle, type HandleServerError, type ServerInit } from '@sveltejs/kit';
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
			event.locals.sessionToken = session.session.token;
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
	// URL yang tidak cocok dengan rute mana pun (route.id null) jatuh ke halaman 404, bukan redirect ke login.
	if (!event.locals.ctx && !isPublic && event.route.id !== null) redirect(303, '/login');

	const response = await svelteKitHandler({ event, resolve, auth, building });
	// Aplikasi privat: jangan diindeks mesin pencari (berlaku juga untuk PDF dan respons API).
	response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
	return response;
};

export const handleError: HandleServerError = ({ error, status }) => {
	// 404 rute tidak dikenal juga lewat sini: jangan dicatat sebagai error dan jangan diganti pesan 500.
	if (status === 404) return { message: 'Halaman yang Anda cari tidak ada atau sudah dipindahkan.' };
	console.error(error);
	// error.fields/ApiError lewat jalur lain (error() SvelteKit) dan tidak masuk sini; di sini hanya error
	// tak terduga (500) dan error rute SvelteKit sendiri (mis. 405), jadi pesan generik aman untuk keduanya.
	if (status >= 500) return { message: 'Terjadi kesalahan di server' };
	return { message: 'Permintaan tidak bisa diproses.' };
};
