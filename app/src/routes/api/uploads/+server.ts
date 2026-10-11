import { json } from '@sveltejs/kit';
import { ApiError, apiHandler } from '$lib/server/api';
import { enqueueCategorization } from '$lib/server/jobs';
import { requireRole } from '$lib/server/rbac';
import { createUpload, listUploads } from '$lib/server/uploads/service';
import { parseWithSidecar } from '$lib/server/uploads/sidecar-client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json({ uploads: await listUploads(ctx.companyId) });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const form = await event.request.formData().catch(() => null);
		const file = form?.get('file');
		if (!(file instanceof File)) throw new ApiError(400, 'invalid_file', 'File PDF wajib diunggah');
		const result = await createUpload(
			{ companyId: ctx.companyId, userId: ctx.user.id, file },
			{ parse: (f) => parseWithSidecar(f), enqueue: enqueueCategorization }
		);
		return json(result, { status: 201 });
	});
