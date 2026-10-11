import { json } from '@sveltejs/kit';
import { listAccounts, listLeafAccounts } from '$lib/server/accounts/queries';
import { createAccount, CreateAccountInput } from '$lib/server/accounts/service';
import { apiHandler, parseJson } from '$lib/server/api';
import { db } from '$lib/server/db';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const leafOnly = event.url.searchParams.get('leaf') === '1';
		const accounts = leafOnly ? await listLeafAccounts(db, ctx.companyId) : await listAccounts(db, ctx.companyId);
		return json({ accounts });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, CreateAccountInput);
		return json(await createAccount(ctx.companyId, ctx.role, input), { status: 201 });
	});
