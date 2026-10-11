import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { removeMember } from '$lib/server/users/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await removeMember(ctx.companyId, parseId(event.params.id, 'Pengguna'));
		return json({ ok: true });
	});
