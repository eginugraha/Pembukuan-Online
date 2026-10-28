import { z } from 'zod';
import { CURRENCIES } from '../currency';
import { InvoiceLineInput, taxRateInput } from './invoice';
import { isoDate, moneyString, optionalText, requiredId, richNotes } from './common';

export const CreateQuotationInput = z
	.object({
		contactId: requiredId('Pelanggan'),
		issueDate: isoDate,
		validUntil: isoDate.optional(),
		discount: moneyString.optional(),
		taxRate: taxRateInput,
		subject: optionalText('Perihal', 200),
		currency: z.enum(CURRENCIES, { error: 'Mata uang tidak valid' }).optional(),
		notes: richNotes('Catatan', 8000),
		lines: z.array(InvoiceLineInput).min(1, 'Isi minimal satu baris')
	})
	.refine((v) => !v.validUntil || !v.issueDate || v.validUntil >= v.issueDate, {
		path: ['validUntil'],
		message: 'Berlaku sampai tidak boleh sebelum tanggal penawaran'
	});
export type CreateQuotationInput = z.infer<typeof CreateQuotationInput>;

/** Ubah dan revisi menimpa/menyalin seluruh dokumen, jadi bentuknya sama dengan buat. */
export const UpdateQuotationInput = CreateQuotationInput;
export type UpdateQuotationInput = CreateQuotationInput;
export const ReviseQuotationInput = CreateQuotationInput;
export type ReviseQuotationInput = CreateQuotationInput;
