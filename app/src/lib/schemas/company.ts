import { z } from 'zod';
import { COA_TEMPLATE_IDS } from '../coa-templates';
import { documentCode, optionalText, requiredText } from './common';

const CompanyFields = z.object({
	name: requiredText('Nama perusahaan', 200),
	npwp: optionalText('NPWP', 20),
	address: optionalText('Alamat', 500)
});

export const CreateCompanyInput = CompanyFields.extend({
	coaTemplate: z.enum(COA_TEMPLATE_IDS, { error: 'Template bagan akun tidak valid' }).default('general')
});
export const UpdateCompanyInput = CompanyFields.extend({
	bankAccountId: z.uuid('Akun bank tidak valid').nullable().optional(),
	code: documentCode,
	email: z.string().trim().max(200).email('Format email tidak valid').optional().or(z.literal('')),
	phone: optionalText('Telepon', 30),
	bankName: optionalText('Nama bank', 100),
	bankAccountNo: optionalText('Nomor rekening', 50),
	bankAccountHolder: optionalText('Nama pemilik rekening', 200),
	swiftCode: z
		.string()
		.trim()
		.toUpperCase()
		.max(11, 'Kode SWIFT maksimal 11 karakter')
		.nullable()
		.optional(),
	signerName: optionalText('Nama penanda tangan', 200),
	signerTitle: optionalText('Jabatan penanda tangan', 200)
});
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInput>;

export const DeleteCompanyInput = z.object({ confirmName: z.string() });
export type DeleteCompanyInput = z.infer<typeof DeleteCompanyInput>;
