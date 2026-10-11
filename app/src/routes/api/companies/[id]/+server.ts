import { json } from '@sveltejs/kit';
import { apiHandler, notFound, parseJson } from '$lib/server/api';
import { UpdateCompanyInput, updateCompany } from '$lib/server/company/service';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		await updateCompany(ctx.companyId, await parseJson(event.request, UpdateCompanyInput));
		return json({ ok: true });
	});
