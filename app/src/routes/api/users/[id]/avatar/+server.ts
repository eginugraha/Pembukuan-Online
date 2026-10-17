import { apiHandler, notFound } from '$lib/server/api';
import { requireUser } from '$lib/server/rbac';
import { getAvatar } from '$lib/server/users/avatar';
import { uuidSchema } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		requireUser(event);
		const id = uuidSchema.safeParse(event.params.id);
		const avatar = id.success ? await getAvatar(id.data) : null;
		if (!avatar) throw notFound('Foto profil');
		return new Response(new Blob([new Uint8Array(avatar.content)]), {
			headers: {
				'content-type': avatar.mime,
				// URL selalu memuat ?v=<waktu update>, jadi aman di-cache lama; private karena butuh login.
				'cache-control': 'private, max-age=31536000, immutable',
				'x-content-type-options': 'nosniff',
				'last-modified': avatar.updatedAt.toUTCString()
			}
		});
	});
