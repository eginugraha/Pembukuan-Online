import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { listTransactions } from '$lib/server/transactions/queries';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const uploadParam = event.url.searchParams.get('upload_id');
		const transactions = await listTransactions(ctx.companyId, {
			uploadId: uploadParam ? parseId(uploadParam, 'Upload') : undefined,
			pendingOnly: event.url.searchParams.get('status') === 'pending'
		});
		return json({ transactions });
	});
