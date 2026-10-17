import { z } from 'zod';
import { requiredId } from './common';

export const CreateRuleInput = z.object({
	// Sama dengan normalizeKeyword di server: dirapikan lalu minimal 3 karakter.
	keyword: z
		.string({ error: 'Keyword wajib diisi' })
		.refine((k) => k.trim().replace(/\s+/g, ' ').length >= 3, 'Keyword rule minimal 3 karakter'),
	accountId: requiredId('Akun'),
	direction: z.enum(['DB', 'CR'], { error: 'Arah tidak valid' }).nullable().optional(),
	priority: z.number().int().min(0, 'Prioritas minimal 0').max(1000, 'Prioritas maksimal 1000').optional()
});
export type CreateRuleInput = z.infer<typeof CreateRuleInput>;
