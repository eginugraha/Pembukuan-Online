import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireSuperAdmin } from '$lib/server/rbac';
import { UpdateUserInput, deleteUser, updateUser } from '$lib/server/users/admin';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		requireSuperAdmin(event);
		const input = await parseJson(event.request, UpdateUserInput);
		await updateUser(parseId(event.params.id, 'Pengguna'), input);
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireSuperAdmin(event);
		await deleteUser(ctx.user.id, parseId(event.params.id, 'Pengguna'));
		return json({ ok: true });
	});
