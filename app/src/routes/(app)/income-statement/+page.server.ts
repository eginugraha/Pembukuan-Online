import { todayIso } from '$lib/dates';
import { defaultReportRange } from '$lib/periods';
import { ApiError } from '$lib/server/api';
import { withPageErrors } from '$lib/server/page';
import { requirePageRole } from '$lib/server/rbac';
import { getCompanyReportInfo } from '$lib/server/reports/company';
import { getIncomeStatementComparative } from '$lib/server/reports/income-statement';
import { rangeParams } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const ctx = requirePageRole(event, 'viewer');
	return withPageErrors(async () => {
		const company = await getCompanyReportInfo(ctx.companyId);
		const defaults = defaultReportRange(todayIso(), company.fiscalYear);
		let range = defaults;
		let rangeError: string | null = null;
		try {
			range = rangeParams(event.url, defaults, company.fiscalYear);
		} catch (e) {
			// Rentang terbalik: tampilkan form dengan rentang bawaan dan pesan, bukan halaman galat.
			if (e instanceof ApiError && e.code === 'invalid_range') rangeError = e.message;
			else throw e;
		}
		return { ...(await getIncomeStatementComparative(ctx.companyId, range)), defaults, rangeError, companyName: company.name };
	});
};
