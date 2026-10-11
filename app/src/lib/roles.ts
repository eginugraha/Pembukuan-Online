export type Role = 'viewer' | 'accountant' | 'admin';

export const ROLES: Role[] = ['viewer', 'accountant', 'admin'];

export const ROLE_LABELS: Record<Role, string> = {
	viewer: 'Viewer',
	accountant: 'Akuntan',
	admin: 'Admin'
};

const RANK: Record<Role, number> = { viewer: 0, accountant: 1, admin: 2 };

export function roleAtLeast(role: Role | null | undefined, min: Role): boolean {
	return !!role && RANK[role] >= RANK[min];
}
