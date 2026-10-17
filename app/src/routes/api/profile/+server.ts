import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireUser } from '$lib/server/rbac';
import { UpdateProfileInput, updateProfileName } from '$lib/server/users/avatar';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireUser(event);
		const { name } = await parseJson(event.request, UpdateProfileInput);
		await updateProfileName(ctx.user.id, name);
		return json({ name });
	});
