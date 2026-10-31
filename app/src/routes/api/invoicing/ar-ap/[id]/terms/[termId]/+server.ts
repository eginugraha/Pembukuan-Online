import { json } from '@sveltejs/kit';
import { setTermPaid } from '$lib/server/arap/entries';
import { SetTermPaidInput } from '$lib/schemas/ar-ap';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const { paid } = await parseJson(event.request, SetTermPaidInput);
		await setTermPaid(ctx.companyId, parseId(event.params.id, 'AR/AP'), parseId(event.params.termId, 'Termin'), paid);
		return json({ ok: true });
	});
