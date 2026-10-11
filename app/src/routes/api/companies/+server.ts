import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { CreateCompanyInput } from '$lib/server/company/service';
import { createCompany } from '$lib/server/company/seed-company';
import { requireSuperAdmin, requireUser } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireUser(event);
		return json({ companies: ctx.companies, activeCompanyId: ctx.companyId });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		requireSuperAdmin(event);
		const input = await parseJson(event.request, CreateCompanyInput);
		return json(await createCompany(input), { status: 201 });
	});
