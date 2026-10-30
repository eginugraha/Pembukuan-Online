import { z } from 'zod';
import { CURRENCIES } from '../currency';
import { moneyString, requiredId, requiredText } from './common';

const positiveAmount = moneyString.refine((v) => Number(v) > 0, 'Jumlah harus lebih dari 0');
const percentString = z
	.string()
	.trim()
	.regex(/^\d{1,3}(\.\d{1,2})?$/, 'Persentase tidak valid')
	.refine((v) => Number(v) > 0 && Number(v) <= 100, 'Persentase harus antara 0 dan 100');

export const ArApTermInput = z
	.object({
		name: requiredText('Nama termin', 100),
		percent: percentString.optional(),
		amount: positiveAmount.optional(),
		paid: z.boolean(),
		documentId: z.string().nullable().optional()
	})
	.refine((t) => t.percent !== undefined || t.amount !== undefined, {
		path: ['percent'],
		message: 'Isi persentase atau nominal'
	});
export type ArApTermInput = z.infer<typeof ArApTermInput>;

export const CreateArApInput = z.object({
	kind: z.enum(['AR', 'AP'], { error: 'Jenis tidak valid' }),
	contactId: requiredId('Kontak'),
	title: requiredText('Judul', 200),
	total: positiveAmount,
	currency: z.enum(CURRENCIES, { error: 'Mata uang tidak valid' }),
	paid: z.boolean(),
	documentId: z.string().nullable().optional(),
	terms: z
		.array(ArApTermInput)
		.refine((t) => t.length === 0 || t.length >= 2, 'Termin minimal 2 atau kosongkan')
});
export type CreateArApInput = z.infer<typeof CreateArApInput>;

/** Ubah menimpa seluruh data; `kind` diabaikan tetapi wajib cocok di service. */
export const UpdateArApInput = CreateArApInput;
export type UpdateArApInput = CreateArApInput;
