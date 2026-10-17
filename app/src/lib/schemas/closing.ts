import { z } from 'zod';
import { isoDate, requiredId } from './common';

export const CloseInput = z.object({
	periodStart: isoDate,
	retainedEarningsAccountId: requiredId('Akun laba ditahan')
});
export type CloseInput = z.infer<typeof CloseInput>;
