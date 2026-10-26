import { json } from '@sveltejs/kit';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireSuperAdmin } from '$lib/server/rbac';
import { CreateUserInput, createUser, listAllUsers } from '$lib/server/users/admin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		requireSuperAdmin(event);
		return json({ users: await listAllUsers() });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		requireSuperAdmin(event);
		const input = await parseJson(event.request, CreateUserInput);
		return json(await createUser(input), { status: 201 });
	});
