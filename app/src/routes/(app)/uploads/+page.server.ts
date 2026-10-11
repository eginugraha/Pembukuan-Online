import { requirePageRole } from '$lib/server/rbac';
import { listUploads } from '$lib/server/uploads/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return { uploads: await listUploads(ctx.companyId) };
};
