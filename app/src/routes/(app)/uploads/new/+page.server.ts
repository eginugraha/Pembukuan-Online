import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	requirePageRole(event, 'accountant');
};
