import { json } from '@sveltejs/kit';
import { getAccountUsage } from '$lib/server/accounts/delete';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		return json(await getAccountUsage(ctx.companyId, parseId(event.params.id, 'Akun')));
	});
