import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { readSignerForm } from '$lib/server/company/signer-form';
import { deleteSigner, updateSigner } from '$lib/server/company/signers';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await updateSigner(ctx.companyId, parseId(event.params.id, 'Penandatangan'), await readSignerForm(event.request));
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		await deleteSigner(ctx.companyId, parseId(event.params.id, 'Penandatangan'));
		return json({ ok: true });
	});
