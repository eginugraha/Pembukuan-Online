import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireUser } from '$lib/server/rbac';
import { ChangePasswordInput, changePassword } from '$lib/server/users/password-change';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireUser(event);
		const input = await parseJson(event.request, ChangePasswordInput);
		await changePassword(ctx.user.id, input.currentPassword, input.newPassword, { keepSessionToken: event.locals.sessionToken });
		return json({ ok: true });
	});
