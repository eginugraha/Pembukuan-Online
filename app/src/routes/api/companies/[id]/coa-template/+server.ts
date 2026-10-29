import { json } from '@sveltejs/kit';
import { COA_TEMPLATE_IDS, type CoaTemplateId } from '$lib/coa-templates';
import { ApiError, apiHandler, notFound, parseJson } from '$lib/server/api';
import { applyTemplateChange, previewTemplateChange } from '$lib/server/company/change-template';
import { ChangeTemplateInput } from '$lib/schemas/company';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		const target = event.url.searchParams.get('target');
		if (!target || !(COA_TEMPLATE_IDS as readonly string[]).includes(target)) {
			throw new ApiError(400, 'validation_error', 'Template bagan akun tidak valid');
		}
		return json(await previewTemplateChange(ctx.companyId, target as CoaTemplateId));
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		const input = await parseJson(event.request, ChangeTemplateInput);
		return json({ summary: await applyTemplateChange(ctx.companyId, input) });
	});
