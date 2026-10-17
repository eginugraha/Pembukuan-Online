import { json } from '@sveltejs/kit';
import { todayIso } from '$lib/dates';
import { defaultReportRange } from '$lib/periods';
import { apiHandler } from '$lib/server/api';
import { requireRole } from '$lib/server/rbac';
import { getCompanyReportInfo } from '$lib/server/reports/company';
import { getTrialBalance } from '$lib/server/reports/trial-balance';
import { rangeParams } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiHandler(async () => {
		const ctx = requireRole(event, 'viewer');
		const company = await getCompanyReportInfo(ctx.companyId);
		const range = rangeParams(event.url, defaultReportRange(todayIso(), company.fiscalYear), company.fiscalYear);
		return json(await getTrialBalance(ctx.companyId, range));
	});
