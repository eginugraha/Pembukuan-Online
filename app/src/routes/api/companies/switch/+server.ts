import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { apiHandler, notFound, parseJson } from '$lib/server/api';
import { COMPANY_COOKIE, requireUser } from '$lib/server/rbac';
import type { RequestHandler } from './$types';

const Body = z.object({ companyId: z.string() });

export const POST: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireUser(event);
		const { companyId } = await parseJson(event.request, Body);
		if (!ctx.companies.some((c) => c.id === companyId)) throw notFound('Perusahaan');
		event.cookies.set(COMPANY_COOKIE, companyId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: event.url.protocol === 'https:',
			maxAge: 60 * 60 * 24 * 365
		});
		return json({ ok: true });
	});
