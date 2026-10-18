import { json } from '@sveltejs/kit';
import { ApiError, apiHandler, notFound } from '$lib/server/api';
import { getCompanyLogo, removeCompanyLogo, setCompanyLogo } from '$lib/server/company/logo';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		const form = await event.request.formData().catch(() => null);
		const file = form?.get('file');
		if (!(file instanceof File)) throw new ApiError(400, 'invalid_image', 'File logo wajib diunggah');
		const image = await setCompanyLogo(ctx.companyId, new Uint8Array(await file.arrayBuffer()));
		return json({ image });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		await removeCompanyLogo(ctx.companyId);
		return json({ image: null });
	});

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		const logo = await getCompanyLogo(ctx.companyId);
		if (!logo) throw notFound('Logo perusahaan');
		return new Response(new Blob([new Uint8Array(logo.content)]), {
			headers: {
				'content-type': logo.mime,
				// URL selalu memuat ?v=<waktu update>, jadi aman di-cache lama; private karena butuh login.
				'cache-control': 'private, max-age=31536000, immutable',
				'x-content-type-options': 'nosniff',
				'last-modified': logo.updatedAt.toUTCString()
			}
		});
	});
