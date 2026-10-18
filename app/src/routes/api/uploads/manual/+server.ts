import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { enqueueCategorization } from '$lib/server/jobs';
import { requireRole } from '$lib/server/rbac';
import { ManualEntryInput } from '$lib/schemas/upload';
import { createManualEntry } from '$lib/server/uploads/service';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, ManualEntryInput);
		const result = await createManualEntry({ companyId: ctx.companyId, userId: ctx.user.id, ...input }, { enqueue: enqueueCategorization });
		return json(result, { status: 201 });
	});
