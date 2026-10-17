import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { apiHandler, parseJson } from '$lib/server/api';
import { updateJournalAccount } from '$lib/server/journal/edit';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

const Input = z.object({ accountId: z.uuid({ error: 'Akun wajib dipilih' }) });

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const { accountId } = await parseJson(event.request, Input);
		await updateJournalAccount(ctx.companyId, ctx.user.id, parseId(event.params.id, 'Jurnal'), accountId);
		return json({ ok: true });
	});
