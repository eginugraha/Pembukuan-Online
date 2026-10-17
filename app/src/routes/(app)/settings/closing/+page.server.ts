import { listAccounts } from '$lib/server/accounts/queries';
import { listFiscalYears } from '$lib/server/closing/years';
import { db } from '$lib/server/db';
import { requirePageRole } from '$lib/server/rbac';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'admin');
	const [years, accounts] = await Promise.all([listFiscalYears(ctx.companyId), listAccounts(db, ctx.companyId)]);
	const equityAccounts = accounts
		.filter((a) => a.type === 'EQUITY' && a.isActive && a.isLeaf)
		.map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type }));
	const defaultRetainedEarningsId = equityAccounts.find((a) => a.name === 'Saldo Laba Ditahan')?.id ?? null;
	return { years, equityAccounts, defaultRetainedEarningsId };
};
