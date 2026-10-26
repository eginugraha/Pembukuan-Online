import { json } from '@sveltejs/kit';
import { apiHandler, notFound, parseJson } from '$lib/server/api';
import { DeleteCompanyInput, UpdateCompanyInput, deleteCompany, updateCompany } from '$lib/server/company/service';
import { requireRole, requireSuperAdmin } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		await updateCompany(ctx.companyId, await parseJson(event.request, UpdateCompanyInput));
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		requireSuperAdmin(event);
		const id = parseId(event.params.id, 'Perusahaan');
		const { confirmName } = await parseJson(event.request, DeleteCompanyInput);
		await deleteCompany(id, confirmName);
		return json({ ok: true });
	});
