import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/api';
import { readSignerForm } from '$lib/server/company/signer-form';
import { createSigner, listSigners } from '$lib/server/company/signers';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => json({ signers: await listSigners(requireRole(event, 'viewer').companyId) }));

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		const id = await createSigner(ctx.companyId, await readSignerForm(event.request));
		return json({ id }, { status: 201 });
	});
