import { eq } from 'drizzle-orm';
import { todayIso } from '../../src/lib/dates';
import { client, db } from '../../src/lib/server/db';
import { companies, transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { accountIdByCode, addMember, makeCompany, makeUpload, makeUser } from '../integration/factory';
import { E2E_CHARTS_EMAIL, E2E_PASSWORD } from '../../playwright.config';

// Dedicated, non-super-admin user + company with journals in two distinct past months of the current
// fiscal year, so the dashboard charts have real data without touching the shared admin/company used by
// other specs. Runs right after reset-db.ts, so it is always on a clean database (idempotent by construction).
//
// The fiscal year is set to start 3 months before today (wrapping the calendar year as needed), so "1 and
// 2 months ago" are always non-future months inside the current fiscal year — this holds no matter which
// month this suite happens to run in, including January (where "last month" is in the previous calendar year).
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const today = todayIso();
const [todayYear, todayMonth] = today.slice(0, 7).split('-').map(Number);

const shiftMonth = (y: number, m: number, delta: number) => {
	const d = new Date(Date.UTC(y, m - 1 + delta, 1));
	return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
};
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

const fiscalStartMonth = shiftMonth(todayYear, todayMonth, -3).m;
const fiscalStartYear = fiscalStartMonth > todayMonth ? todayYear - 1 : todayYear;
const fiscalStart = `${ym(fiscalStartYear, fiscalStartMonth)}-01`;

const twoAgo = shiftMonth(todayYear, todayMonth, -2);
const oneAgo = shiftMonth(todayYear, todayMonth, -1);
const prev = ym(twoAgo.y, twoAgo.m);
const cur = ym(oneAgo.y, oneAgo.m);

const { companyId, bankAccountId } = await makeCompany('ZZ Grafik E2E');
await db.update(companies).set({ fiscalYear: MONTHS[fiscalStartMonth - 1] }).where(eq(companies.id, companyId));
const user = await makeUser({ email: E2E_CHARTS_EMAIL, name: 'Grafik E2E', password: E2E_PASSWORD });
await addMember(user.id, companyId, 'admin');
await saveOpening(companyId, user.id, {
	date: fiscalStart,
	lines: [
		{ accountId: bankAccountId, debit: '500000000', credit: '0' },
		{ accountId: await accountIdByCode(companyId, '3-1001'), debit: '0', credit: '500000000' }
	]
});
const rows = [
	{ d: 'E2E JUAL A', date: `${prev}-01`, credit: '1234567890', code: '4-1001' },
	{ d: 'E2E BEBAN A', date: `${prev}-02`, debit: '234567890', code: '5-2010' },
	{ d: 'E2E JUAL B', date: `${cur}-01`, credit: '987654321', code: '4-1001' },
	{ d: 'E2E HPP B', date: `${cur}-01`, debit: '456789012', code: '5-1001' }
];
const { uploadId } = await makeUpload(
	companyId,
	user.id,
	rows.map((r) => ({ date: r.date, description: r.d, debit: r.debit, credit: r.credit })),
	{ periodStart: `${prev}-01`, periodEnd: `${cur}-01` }
);
for (const r of rows)
	await db
		.update(transactions)
		.set({ isConfirmed: true, accountId: await accountIdByCode(companyId, r.code) })
		.where(eq(transactions.description, r.d));
await generateJournal(companyId, uploadId, user.id);
await client.end();
