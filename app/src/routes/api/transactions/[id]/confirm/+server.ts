import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { ConfirmInput, confirmTransaction } from '$lib/server/transactions/confirm';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const id = parseId(event.params.id, 'Transaksi');
		const input = await parseJson(event.request, ConfirmInput);
		return json(await confirmTransaction(ctx.companyId, ctx.user.id, id, input));
	});
