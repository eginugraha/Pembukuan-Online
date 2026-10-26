import { listLeafAccounts } from '$lib/server/accounts/queries';
import { getCompany } from '$lib/server/company/service';
import { db } from '$lib/server/db';
import { requirePageRole } from '$lib/server/rbac';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.ctx;
	if (!user) redirect(303, '/login');
	// Super Admin yang perusahaan terakhirnya baru dihapus tidak punya perusahaan aktif: hanya boleh membuat yang baru.
	if (!user.companyId) {
		if (!user.user.isSuperAdmin) error(403, 'Anda tidak memiliki akses ke halaman ini');
		return { company: null, assetAccounts: [], showNew: true, isSuperAdmin: true };
	}
	const ctx = requirePageRole(event, 'admin');
	const [company, leaf] = await Promise.all([getCompany(ctx.companyId), listLeafAccounts(db, ctx.companyId)]);
	return {
		company,
		assetAccounts: leaf.filter((a) => a.type === 'ASSET'),
		showNew: ctx.user.isSuperAdmin && event.url.searchParams.get('new') === '1',
		isSuperAdmin: ctx.user.isSuperAdmin
	};
};
