import { z } from 'zod';
import { isoDate, moneyString, requiredId } from './common';

export const OpeningInput = z.object({
	date: isoDate,
	lines: z.array(z.object({ accountId: requiredId('Akun'), debit: moneyString, credit: moneyString }))
});
export type OpeningInput = z.infer<typeof OpeningInput>;
