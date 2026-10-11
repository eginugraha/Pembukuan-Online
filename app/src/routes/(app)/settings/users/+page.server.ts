import { requirePageRole } from '$lib/server/rbac';
import { listMembers } from '$lib/server/users/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'admin');
	return { members: await listMembers(ctx.companyId), me: ctx.user.id, isSuperAdmin: ctx.user.isSuperAdmin };
};
