import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { deleteRule } from '$lib/server/rules/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await deleteRule(ctx.companyId, parseId(event.params.id, 'Rule'));
		return json({ ok: true });
	});
