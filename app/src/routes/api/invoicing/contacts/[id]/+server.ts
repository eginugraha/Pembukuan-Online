import { json } from '@sveltejs/kit';
import { deleteContact, updateContact, UpdateContactInput } from '$lib/server/invoicing/contacts';
import { apiHandler, parseJson } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await updateContact(ctx.companyId, parseId(event.params.id, 'Kontak'), await parseJson(event.request, UpdateContactInput));
		return json({ ok: true });
	});

export const DELETE: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'accountant');
		await deleteContact(ctx.companyId, parseId(event.params.id, 'Kontak'));
		return json({ ok: true });
	});
