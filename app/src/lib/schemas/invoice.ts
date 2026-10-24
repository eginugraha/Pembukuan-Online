import { z } from 'zod';
import { isoDate, moneyString, optionalText, requiredId, requiredText } from './common';

const positiveAmount = moneyString.refine((v) => Number(v) > 0, 'Jumlah harus lebih dari 0');

export const InvoiceLineInput = z.object({
	description: requiredText('Keterangan', 200),
	quantity: positiveAmount,
	unitPrice: positiveAmount
});
export type InvoiceLineInput = z.infer<typeof InvoiceLineInput>;

export const CreateInvoiceInput = z.object({
	contactId: requiredId('Pelanggan'),
	issueDate: isoDate,
	taxRate: z
		.string()
		.trim()
		.regex(/^\d{1,3}(\.\d{1,2})?$/, 'Tarif PPN tidak valid')
		.refine((v) => Number(v) <= 100, 'Tarif PPN maksimal 100%')
		.optional(),
	notes: optionalText('Catatan', 500),
	lines: z.array(InvoiceLineInput).min(1, 'Isi minimal satu baris')
});
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInput>;

/** Ubah menimpa seluruh dokumen, jadi bentuknya sama dengan buat. */
export const UpdateInvoiceInput = CreateInvoiceInput;
export type UpdateInvoiceInput = CreateInvoiceInput;
