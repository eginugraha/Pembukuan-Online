import { json } from '@sveltejs/kit';
import { reviseQuotation, ReviseQuotationInput } from '$lib/server/invoicing/quotations';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

/** Buat revisi dari versi terbaru; balasan berisi id versi baru. */
export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, ReviseQuotationInput);
		return json(await reviseQuotation(ctx.companyId, ctx.user.id, parseId(event.params.id, 'Penawaran'), input), { status: 201 });
	});
