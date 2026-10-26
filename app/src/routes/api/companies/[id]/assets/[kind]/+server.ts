import { json } from '@sveltejs/kit';
import { ApiError, apiHandler, notFound } from '$lib/server/api';
import { getCompanyAsset, isAssetKind, removeCompanyAsset, setCompanyAsset } from '$lib/server/company/assets';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		const kind = event.params.kind;
		if (!isAssetKind(kind)) throw notFound('Gambar');
		const form = await event.request.formData().catch(() => null);
		const file = form?.get('file');
		if (!(file instanceof File)) throw new ApiError(400, 'invalid_image', 'File gambar wajib diunggah');
		const image = await setCompanyAsset(ctx.companyId, kind, new Uint8Array(await file.arrayBuffer()));
		return json({ image });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		const kind = event.params.kind;
		if (!isAssetKind(kind)) throw notFound('Gambar');
		await removeCompanyAsset(ctx.companyId, kind);
		return json({ image: null });
	});

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		if (event.params.id !== ctx.companyId) throw notFound('Perusahaan');
		const kind = event.params.kind;
		if (!isAssetKind(kind)) throw notFound('Gambar');
		const asset = await getCompanyAsset(ctx.companyId, kind);
		if (!asset) throw notFound('Gambar');
		return new Response(new Blob([new Uint8Array(asset.content)]), {
			headers: {
				'content-type': asset.mime,
				// URL selalu memuat ?v=<waktu update>, jadi aman di-cache lama; private karena butuh login.
				'cache-control': 'private, max-age=31536000, immutable',
				'x-content-type-options': 'nosniff',
				'last-modified': asset.updatedAt.toUTCString()
			}
		});
	});
