import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { deleteAccount } from '$lib/server/accounts/delete';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

const Input = z.object({ moveToId: z.uuid({ error: 'Akun tujuan tidak valid' }).optional() });

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		const { moveToId } = await parseJson(event.request, Input);
		await deleteAccount(ctx.companyId, parseId(event.params.id, 'Akun'), moveToId);
		return json({ ok: true });
	});
