import { json } from '@sveltejs/kit';
import { ApiError, apiHandler } from '$lib/server/api';
import { requireUser } from '$lib/server/rbac';
import { removeAvatar, setAvatar } from '$lib/server/users/avatar';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireUser(event);
		const form = await event.request.formData().catch(() => null);
		const file = form?.get('file');
		if (!(file instanceof File)) throw new ApiError(400, 'invalid_image', 'File foto wajib diunggah');
		const image = await setAvatar(ctx.user.id, new Uint8Array(await file.arrayBuffer()));
		return json({ image });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireUser(event);
		await removeAvatar(ctx.user.id);
		return json({ image: null });
	});
