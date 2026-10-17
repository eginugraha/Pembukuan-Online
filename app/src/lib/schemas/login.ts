import { z } from 'zod';
import { emailField } from './common';

export const LoginInput = z.object({
	email: emailField,
	password: z.string({ error: 'Password wajib diisi' }).min(1, 'Password wajib diisi')
});
