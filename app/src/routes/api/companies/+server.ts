import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { requireUser } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireUser(event);
		return json({ companies: ctx.companies, activeCompanyId: ctx.companyId });
	});
