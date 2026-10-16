// Daftar template CoA yang aman diimpor dari client. Datanya ada di $lib/server/company/templates.ts.
export const COA_TEMPLATES = [
	{ id: 'general', label: 'Umum (dagang / jasa)' },
	{ id: 'it', label: 'Perusahaan IT / Software' }
] as const;

export type CoaTemplateId = (typeof COA_TEMPLATES)[number]['id'];
export const COA_TEMPLATE_IDS = COA_TEMPLATES.map((t) => t.id) as [CoaTemplateId, ...CoaTemplateId[]];
