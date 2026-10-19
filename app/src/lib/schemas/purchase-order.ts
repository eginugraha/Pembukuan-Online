import { z } from 'zod';
import { isoDate, moneyString, optionalText, requiredId, requiredText } from './common';

const positiveAmount = moneyString.refine((v) => Number(v) > 0, 'Jumlah harus lebih dari 0');

export const POLineInput = z.object({
	description: requiredText('Keterangan', 200),
	quantity: positiveAmount,
	unitPrice: positiveAmount,
	expenseAccountId: requiredId('Akun biaya')
});
export type POLineInput = z.infer<typeof POLineInput>;

export const CreatePurchaseOrderInput = z
	.object({
		contactId: requiredId('Pemasok'),
		issueDate: isoDate,
		expectedDate: isoDate.optional(),
		payableAccountId: requiredId('Akun utang usaha'),
		taxRate: z
			.string()
			.trim()
			.regex(/^\d{1,3}(\.\d{1,2})?$/, 'Tarif PPN tidak valid')
			.refine((v) => Number(v) <= 100, 'Tarif PPN maksimal 100%')
			.optional(),
		taxAccountId: requiredId('Akun PPN').optional(),
		notes: optionalText('Catatan', 500),
		lines: z.array(POLineInput).min(1, 'Isi minimal satu baris')
	})
	.refine((v) => !v.taxRate || Number(v.taxRate) === 0 || !!v.taxAccountId, {
		message: 'Akun PPN wajib diisi kalau tarif PPN diisi',
		path: ['taxAccountId']
	});
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderInput>;

export const ReceivePurchaseOrderInput = z.object({ date: isoDate });
export type ReceivePurchaseOrderInput = z.infer<typeof ReceivePurchaseOrderInput>;
