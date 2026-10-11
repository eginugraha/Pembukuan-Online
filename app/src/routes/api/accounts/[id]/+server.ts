import { json } from '@sveltejs/kit';
import { deactivateAccount, UpdateAccountInput, updateAccount } from '$lib/server/accounts/service';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await updateAccount(ctx.companyId, parseId(event.params.id, 'Akun'), await parseJson(event.request, UpdateAccountInput));
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await deactivateAccount(ctx.companyId, parseId(event.params.id, 'Akun'));
		return json({ ok: true });
	});
