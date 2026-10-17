import { z } from 'zod';
import { ROLES } from '../roles';
import { emailField } from './common';

const roleEnum = z.enum(ROLES as [string, ...string[]], { error: 'Role wajib dipilih' }) as z.ZodEnum<{ admin: 'admin'; accountant: 'accountant'; viewer: 'viewer' }>;

export const AddMemberInput = z.object({
	email: emailField,
	name: z.string().trim().max(200, 'Nama maksimal 200 karakter').optional(),
	password: z.string().min(8, 'Password minimal 8 karakter').optional(),
	role: roleEnum
});
export type AddMemberInput = z.infer<typeof AddMemberInput>;
export const ChangeRoleInput = z.object({ role: roleEnum });
export const SuperAdminInput = z.object({ value: z.boolean() });
