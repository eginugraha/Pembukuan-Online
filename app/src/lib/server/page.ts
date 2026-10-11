import { error } from '@sveltejs/kit';
import { ApiError } from './api';

/** Untuk load function halaman: ubah ApiError dari service menjadi halaman error SvelteKit. */
export async function withPageErrors<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof ApiError) error(e.status, e.message);
		throw e;
	}
}
