import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireSuperAdmin } from '$lib/server/rbac';
import { SetMembershipInput, setMembership } from '$lib/server/users/admin';
import { removeMember } from '$lib/server/users/service';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		requireSuperAdmin(event);
		const { role } = await parseJson(event.request, SetMembershipInput);
		await setMembership(
			parseId(event.params.id, 'Pengguna'),
			parseId(event.params.companyId, 'Perusahaan'),
			role
		);
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		requireSuperAdmin(event);
		await removeMember(parseId(event.params.companyId, 'Perusahaan'), parseId(event.params.id, 'Pengguna'));
		return json({ ok: true });
	});
