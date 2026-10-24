import { z } from 'zod';
import { optionalText, requiredText } from './common';

export const CreateContactInput = z.object({
	kind: z.enum(['CUSTOMER', 'VENDOR', 'BOTH'], { error: 'Jenis kontak wajib dipilih' }),
	name: requiredText('Nama', 200),
	npwp: optionalText('NPWP', 20),
	attention: optionalText('Attention', 200),
	position: optionalText('Posisi', 200),
	address: optionalText('Alamat', 500),
	email: z.string().trim().max(200).email('Format email tidak valid').optional().or(z.literal('')),
	phone: optionalText('Telepon', 30)
});
export type CreateContactInput = z.infer<typeof CreateContactInput>;
export const UpdateContactInput = CreateContactInput.partial().extend({ isActive: z.boolean().optional() });
export type UpdateContactInput = z.infer<typeof UpdateContactInput>;
