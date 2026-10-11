import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { listTransactions } from '$lib/server/transactions/queries';
import { deleteUpload, getUpload } from '$lib/server/uploads/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const id = parseId(event.params.id, 'Upload');
		const upload = await getUpload(ctx.companyId, id);
		return json({ upload, transactions: await listTransactions(ctx.companyId, { uploadId: id }) });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await deleteUpload(ctx.companyId, parseId(event.params.id, 'Upload'));
		return json({ ok: true });
	});
