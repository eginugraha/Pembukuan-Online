import { z } from 'zod';
import { isoDate, moneyString, requiredId } from './common';

export const CreateAdvanceReceiptInput = z.object({
	contactId: requiredId('Pelanggan'),
	receiptDate: isoDate,
	amount: moneyString.refine((v) => Number(v) > 0, 'Jumlah harus lebih dari 0'),
	deferredRevenueAccountId: requiredId('Akun pendapatan diterima dimuka')
});
export type CreateAdvanceReceiptInput = z.infer<typeof CreateAdvanceReceiptInput>;
