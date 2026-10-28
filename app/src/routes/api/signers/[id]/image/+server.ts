import { apiHandler, notFound } from '$lib/server/api';
import { getSigner } from '$lib/server/company/signers';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const signer = await getSigner(ctx.companyId, parseId(event.params.id, 'Penandatangan'));
		if (!signer.content || !signer.mime) throw notFound('Gambar');
		return new Response(new Blob([new Uint8Array(signer.content)]), {
			headers: { 'content-type': signer.mime, 'cache-control': 'private, no-cache' }
		});
	});
