import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { apiHandler, parseJson } from '$lib/server/api';
import { generateJournal } from '$lib/server/journal/generate';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

const Body = z.object({ uploadId: z.uuid() });

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const { uploadId } = await parseJson(event.request, Body);
		return json(await generateJournal(ctx.companyId, uploadId, ctx.user.id));
	});
