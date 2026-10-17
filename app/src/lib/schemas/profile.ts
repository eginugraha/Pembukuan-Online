import { z } from 'zod';
import { requiredText } from './common';

export const UpdateProfileInput = z.object({ name: requiredText('Nama', 100) });

const password = (label: string) => z.string({ error: `${label} wajib diisi` }).min(1, `${label} wajib diisi`);

export const ChangePasswordInput = z
	.object({
		currentPassword: password('Password saat ini'),
		newPassword: password('Password baru').min(8, 'Password baru minimal 8 karakter').max(128, 'Password baru maksimal 128 karakter'),
		confirmPassword: password('Konfirmasi password')
	})
	.superRefine((v, ctx) => {
		if (v.newPassword !== v.confirmPassword) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Konfirmasi password tidak sama' });
		if (v.newPassword === v.currentPassword) ctx.addIssue({ code: 'custom', path: ['newPassword'], message: 'Password baru harus berbeda dari password saat ini' });
	});
