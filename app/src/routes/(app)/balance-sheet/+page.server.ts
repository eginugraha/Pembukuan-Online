import { todayIso } from '$lib/dates';
import { defaultBalanceSheetAsOf } from '$lib/periods';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { getBalanceSheetComparative } from '$lib/server/reports/balance-sheet';
import { getCompanyReportInfo } from '$lib/server/reports/company';
import { dateParam } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return withPageErrors(async () => {
		const company = await getCompanyReportInfo(ctx.companyId);
		const defaultAsOf = defaultBalanceSheetAsOf(todayIso(), company.fiscalYear);
		const asOf = dateParam(event.url, 'as_of') ?? defaultAsOf;
		const { current, comparative } = await getBalanceSheetComparative(ctx.companyId, asOf);
		return { current, comparative, defaultAsOf, companyName: company.name };
	});
};
