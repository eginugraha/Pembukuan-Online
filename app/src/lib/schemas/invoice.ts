import { z } from 'zod';
import { isoDate, moneyString, optionalText, requiredId, requiredText } from './common';

const positiveAmount = moneyString.refine((v) => Number(v) > 0, 'Jumlah harus lebih dari 0');

export const InvoiceLineInput = z.object({
	description: requiredText('Keterangan', 200),
	quantity: positiveAmount,
	unitPrice: positiveAmount,
	revenueAccountId: requiredId('Akun pendapatan')
});
export type InvoiceLineInput = z.infer<typeof InvoiceLineInput>;

export const CreateInvoiceInput = z
	.object({
		contactId: requiredId('Pelanggan'),
		issueDate: isoDate,
		receivableAccountId: requiredId('Akun piutang usaha'),
		taxRate: z
			.string()
			.trim()
			.regex(/^\d{1,3}(\.\d{1,2})?$/, 'Tarif PPN tidak valid')
			.optional(),
		taxAccountId: requiredId('Akun PPN').optional(),
		notes: optionalText('Catatan', 500),
		lines: z.array(InvoiceLineInput).min(1, 'Isi minimal satu baris')
	})
	.refine((v) => !v.taxRate || Number(v.taxRate) === 0 || !!v.taxAccountId, {
		message: 'Akun PPN wajib diisi kalau tarif PPN diisi',
		path: ['taxAccountId']
	});
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInput>;

export const SendInvoiceInput = z.object({ date: isoDate });
export type SendInvoiceInput = z.infer<typeof SendInvoiceInput>;

export const PayInvoiceInput = z.discriminatedUnion('method', [
	z.object({ date: isoDate, method: z.literal('BANK') }),
	z.object({ date: isoDate, method: z.literal('ADVANCE_RECEIPT'), advanceReceiptId: requiredId('Uang muka') })
]);
export type PayInvoiceInput = z.infer<typeof PayInvoiceInput>;
