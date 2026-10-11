import { error } from '@sveltejs/kit';
import { roleAtLeast } from '$lib/roles';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { listTransactions } from '$lib/server/transactions/queries';
import { getUpload } from '$lib/server/uploads/service';
import { uuidSchema } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const id = uuidSchema.safeParse(event.params.id);
	if (!id.success) error(404, 'Upload tidak ditemukan');
	const upload = await withPageErrors(() => getUpload(ctx.companyId, id.data));
	const transactions = await listTransactions(ctx.companyId, { uploadId: id.data });
	return {
		upload,
		transactions,
		canWrite: roleAtLeast(ctx.role, 'accountant'),
		canDelete: roleAtLeast(ctx.role, 'admin')
	};
};
