import { json } from '@sveltejs/kit';
import { getInvoice } from '$lib/server/invoicing/invoices';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		return json(await getInvoice(ctx.companyId, parseId(event.params.id, 'Invoice')));
	});
