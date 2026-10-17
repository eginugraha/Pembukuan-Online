import { z } from 'zod';
import { requiredId, requiredText } from './common';

const code = requiredText('Kode', 20).regex(/^[0-9]+(-[0-9]+)*$/, 'Kode hanya boleh angka dan tanda hubung, mis. 1-1008');
const normalBal = z.enum(['DEBIT', 'CREDIT'], { error: 'Saldo normal tidak valid' });
const cashFlowCat = z.enum(['OPERATING', 'INVESTING', 'FINANCING'], { error: 'Kategori arus kas tidak valid' });

export const CreateAccountInput = z.object({
	code,
	name: requiredText('Nama', 200),
	parentId: requiredId('Akun induk'),
	normalBal: normalBal.optional(),
	cashFlowCat: cashFlowCat.nullable().optional()
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

export const UpdateAccountInput = z.object({
	code: code.optional(),
	name: requiredText('Nama', 200).optional(),
	normalBal: normalBal.optional(),
	cashFlowCat: cashFlowCat.nullable().optional(),
	isActive: z.boolean().optional()
});
export type UpdateAccountInput = z.infer<typeof UpdateAccountInput>;
