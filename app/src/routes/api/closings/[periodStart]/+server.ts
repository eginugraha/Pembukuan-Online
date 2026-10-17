import { json } from '@sveltejs/kit';
import { ApiError, apiHandler } from '$lib/server/api';
import { reopenFiscalYear } from '$lib/server/closing/close';
import { requireRole } from '$lib/server/rbac';
import { isoDate } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		const parsed = isoDate.safeParse(event.params.periodStart);
		if (!parsed.success) throw new ApiError(400, 'validation_error', 'Periode harus berformat YYYY-MM-DD');
		await reopenFiscalYear(ctx.companyId, parsed.data);
		return json({ ok: true });
	});
