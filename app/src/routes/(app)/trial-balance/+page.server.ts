import { todayIso } from '$lib/dates';
import { defaultReportRange } from '$lib/periods';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { getCompanyReportInfo } from '$lib/server/reports/company';
import { getTrialBalance } from '$lib/server/reports/trial-balance';
import { rangeParams } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return withPageErrors(async () => {
		const company = await getCompanyReportInfo(ctx.companyId);
		const defaults = defaultReportRange(todayIso(), company.fiscalYear);
		const range = rangeParams(event.url, defaults, company.fiscalYear);
		return { tb: await getTrialBalance(ctx.companyId, range), defaults, companyName: company.name };
	});
};
