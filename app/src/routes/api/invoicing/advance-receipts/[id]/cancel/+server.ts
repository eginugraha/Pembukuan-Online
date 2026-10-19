import { json } from '@sveltejs/kit';
import { cancelAdvanceReceipt } from '$lib/server/invoicing/advance-receipts';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		const id = parseId(event.params.id, 'Uang muka');
		await cancelAdvanceReceipt(ctx.companyId, ctx.user.id, id);
		return json({ ok: true });
	});
