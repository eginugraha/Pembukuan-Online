import { z } from 'zod';
import { COA_TEMPLATE_IDS } from '../coa-templates';
import { optionalText, requiredText } from './common';

const CompanyFields = z.object({
	name: requiredText('Nama perusahaan', 200),
	npwp: optionalText('NPWP', 20),
	address: optionalText('Alamat', 500)
});

export const CreateCompanyInput = CompanyFields.extend({
	coaTemplate: z.enum(COA_TEMPLATE_IDS, { error: 'Template bagan akun tidak valid' }).default('general')
});
export const UpdateCompanyInput = CompanyFields.extend({ bankAccountId: z.uuid('Akun bank tidak valid').nullable().optional() });
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInput>;

export const DeleteCompanyInput = z.object({ confirmName: z.string() });
export type DeleteCompanyInput = z.infer<typeof DeleteCompanyInput>;
