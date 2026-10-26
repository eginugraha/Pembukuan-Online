import { z } from 'zod';
import { emailField, requiredText } from './common';
import { ChangeRoleInput } from './member';

export const CreateUserInput = z.object({
	name: requiredText('Nama', 200),
	email: emailField,
	password: z.string().min(8, 'Password minimal 8 karakter'),
	isSuperAdmin: z.boolean().default(false)
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateUserInput = z.object({
	name: requiredText('Nama', 200),
	email: emailField,
	password: z.string().min(8, 'Password minimal 8 karakter').optional()
});
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

export const SetMembershipInput = ChangeRoleInput;
export type SetMembershipInput = z.infer<typeof SetMembershipInput>;
