import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { BulkConfirmInput, bulkConfirm } from '$lib/server/transactions/confirm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, BulkConfirmInput);
		return json(await bulkConfirm(ctx.companyId, ctx.user.id, input));
	});
