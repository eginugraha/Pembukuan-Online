import { monthRange, todayIso } from '$lib/dates';
import { getOpening } from '$lib/server/journal/opening';
import { requirePageRole } from '$lib/server/rbac';
import { getTrialBalance } from '$lib/server/reports/trial-balance';
import { listTransactions } from '$lib/server/transactions/queries';
import { listUploads } from '$lib/server/uploads/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	const asOf = monthRange(todayIso()).to;
	const [pending, uploads, tb, opening] = await Promise.all([
		listTransactions(ctx.companyId, { pendingOnly: true }),
		listUploads(ctx.companyId),
		getTrialBalance(ctx.companyId, asOf),
		getOpening(ctx.companyId)
	]);
	return {
		pendingCount: pending.length,
		recentUploads: uploads.slice(0, 5),
		trialBalance: { asOf, balanced: tb.balanced, accounts: tb.rows.length },
		hasOpening: opening !== null
	};
};
