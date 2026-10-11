import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireSuperAdmin } from '$lib/server/rbac';
import { SuperAdminInput, setSuperAdmin } from '$lib/server/users/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireSuperAdmin(event);
		const { value } = await parseJson(event.request, SuperAdminInput);
		await setSuperAdmin(ctx.user.id, parseId(event.params.id, 'Pengguna'), value);
		return json({ ok: true });
	});
