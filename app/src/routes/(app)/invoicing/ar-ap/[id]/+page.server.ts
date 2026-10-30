import { getArAp } from '$lib/server/arap/entries';
import { requirePageRole } from '$lib/server/rbac';
import { withPageErrors } from '$lib/server/page';
import { parseId } from '$lib/server/validation';
import { roleAtLeast } from '$lib/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const id = await withPageErrors(async () => parseId(event.params.id, 'AR/AP'));
	const entry = await withPageErrors(() => getArAp(ctx.companyId, id));
	return { entry, canWrite: roleAtLeast(ctx.role, 'accountant') };
};
