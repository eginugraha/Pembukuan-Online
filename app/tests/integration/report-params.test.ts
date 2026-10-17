import { beforeEach, expect, test } from 'bun:test';
import { rangeParams } from '../../src/lib/server/validation';
import { getCompanyReportInfo } from '../../src/lib/server/reports/company';
import { makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

const d = { from: '2026-01-01', to: '2026-10-31' };

const thrown = (fn: () => unknown): unknown => {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return undefined;
};

test('rangeParams menolak from > to', () => {
	const run = () => rangeParams(new URL('http://x/?from=2026-02-01&to=2026-01-01'), d, 'JANUARY');
	expect(run).toThrow();
	expect(thrown(run)).toMatchObject({ code: 'invalid_range', status: 400 });
});

test('rangeParams as_of dan default', () => {
	expect(rangeParams(new URL('http://x/?as_of=2026-08-31'), d, 'JANUARY')).toEqual({ from: '2026-01-01', to: '2026-08-31' });
	expect(rangeParams(new URL('http://x/'), d, 'JANUARY')).toEqual(d);
});

test('getCompanyReportInfo', async () => {
	const { companyId } = await makeCompany('PT Laporan');
	expect(await getCompanyReportInfo(companyId)).toEqual({ name: 'PT Laporan', fiscalYear: 'JANUARY' });
	await expect(getCompanyReportInfo('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ status: 404 });
});
