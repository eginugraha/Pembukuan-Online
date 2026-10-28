import { json } from '@sveltejs/kit';
import { approveQuotation, unapproveQuotation } from '$lib/server/invoicing/quotations';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await approveQuotation(ctx.companyId, ctx.user.id, parseId(event.params.id, 'Penawaran'));
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await unapproveQuotation(ctx.companyId, parseId(event.params.id, 'Penawaran'));
		return json({ ok: true });
	});
