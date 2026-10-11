import { fail, redirect } from '@sveltejs/kit';
import { getAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { findUserByEmail } from '$lib/server/users/create';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.ctx) redirect(303, '/dashboard');
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const invalid = () => fail(400, { email, message: 'Email atau password salah' });

		const existing = await findUserByEmail(db, email);
		if (!existing || !existing.isActive) return invalid();
		try {
			await getAuth().api.signInEmail({ body: { email: existing.email, password }, headers: request.headers });
		} catch {
			return invalid();
		}
		redirect(303, '/dashboard');
	}
};
