import { error } from '@sveltejs/kit';
import { COA_TEMPLATES, COA_TEMPLATE_IDS, type CoaTemplateId } from '$lib/coa-templates';
import { previewTemplateChange } from '$lib/server/company/change-template';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'admin');
	const target = event.url.searchParams.get('target');
	if (!target || !(COA_TEMPLATE_IDS as readonly string[]).includes(target)) error(400, 'Template bagan akun tidak valid');
	const id = target as CoaTemplateId;
	const { diff, fingerprint } = await previewTemplateChange(ctx.companyId, id);
	return {
		diff,
		fingerprint,
		target: id,
		targetLabel: COA_TEMPLATES.find((t) => t.id === id)!.label,
		companyId: ctx.companyId
	};
};
