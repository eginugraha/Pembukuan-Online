import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { enqueueCategorization } from '$lib/server/jobs';
import { requireRole } from '$lib/server/rbac';
import { retryCategorization } from '$lib/server/uploads/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await retryCategorization(ctx.companyId, parseId(event.params.id, 'Upload'), enqueueCategorization);
		return json({ ok: true });
	});
