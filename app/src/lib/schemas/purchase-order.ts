import { z } from 'zod';
import { CURRENCIES } from '../currency';
import { isoDate, moneyString, optionalText, requiredId, requiredText, richNotes } from './common';

const positiveAmount = moneyString.refine((v) => Number(v) > 0, 'Jumlah harus lebih dari 0');

export const POLineInput = z.object({
	description: requiredText('Keterangan', 200),
	quantity: positiveAmount,
	unitPrice: positiveAmount
});
export type POLineInput = z.infer<typeof POLineInput>;

export const CreatePurchaseOrderInput = z.object({
	contactId: requiredId('Pemasok'),
	issueDate: isoDate,
	expectedDate: isoDate.optional(),
	taxRate: z
		.string()
		.trim()
		.regex(/^\d{1,3}(\.\d{1,2})?$/, 'Tarif PPN tidak valid')
		.refine((v) => Number(v) <= 100, 'Tarif PPN maksimal 100%')
		.optional(),
	subject: optionalText('Perihal', 200),
	currency: z.enum(CURRENCIES, { error: 'Mata uang tidak valid' }).optional(),
	notes: richNotes('Catatan', 8000),
	lines: z.array(POLineInput).min(1, 'Isi minimal satu baris')
});
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderInput>;

/** Ubah menimpa seluruh dokumen, jadi bentuknya sama dengan buat. */
export const UpdatePurchaseOrderInput = CreatePurchaseOrderInput;
export type UpdatePurchaseOrderInput = CreatePurchaseOrderInput;
