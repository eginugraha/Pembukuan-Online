import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { ChangeRoleInput, changeRole } from '$lib/server/users/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		const { role } = await parseJson(event.request, ChangeRoleInput);
		await changeRole(ctx.companyId, parseId(event.params.id, 'Pengguna'), role);
		return json({ ok: true });
	});
