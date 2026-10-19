import { json } from '@sveltejs/kit';
import { createContact, CreateContactInput, listContacts } from '$lib/server/invoicing/contacts';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const kind = event.url.searchParams.get('kind');
		const opts: { kind?: 'CUSTOMER' | 'VENDOR' } | undefined =
			kind === 'CUSTOMER' || kind === 'VENDOR' ? { kind } : undefined;
		return json({ contacts: await listContacts(ctx.companyId, opts) });
	});

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		const input = await parseJson(event.request, CreateContactInput);
		return json(await createContact(ctx.companyId, input), { status: 201 });
	});
