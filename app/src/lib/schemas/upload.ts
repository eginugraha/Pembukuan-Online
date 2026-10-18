import { z } from 'zod';
import { isoDate, moneyString, requiredText } from './common';

const positiveAmount = moneyString.refine((v) => Number(v) > 0, 'Jumlah harus lebih dari 0');

export const ManualEntryInput = z.object({
	bank: requiredText('Nama bank', 20),
	accountNo: requiredText('Nomor rekening', 30),
	openingBalance: moneyString.optional(),
	rows: z
		.array(
			z.object({
				date: isoDate,
				description: requiredText('Keterangan', 200),
				direction: z.enum(['DB', 'CR']),
				amount: positiveAmount
			})
		)
		.min(1, 'Isi minimal satu baris transaksi')
});
export type ManualEntryInput = z.infer<typeof ManualEntryInput>;
