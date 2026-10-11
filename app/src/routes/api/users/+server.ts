import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { AddMemberInput, addMember, listMembers } from '$lib/server/users/service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		return json({ users: await listMembers(ctx.companyId) });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'admin');
		return json(await addMember(ctx.companyId, await parseJson(event.request, AddMemberInput)), { status: 201 });
	});
