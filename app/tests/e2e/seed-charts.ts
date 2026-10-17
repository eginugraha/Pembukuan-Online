import { eq } from 'drizzle-orm';
import { todayIso } from '../../src/lib/dates';
import { client, db } from '../../src/lib/server/db';
import { transactions } from '../../src/lib/server/db/schema';
import { generateJournal } from '../../src/lib/server/journal/generate';
import { saveOpening } from '../../src/lib/server/journal/opening';
import { accountIdByCode, addMember, makeCompany, makeUpload, makeUser } from '../integration/factory';
import { E2E_CHARTS_EMAIL, E2E_PASSWORD } from '../../playwright.config';

// Dedicated, non-super-admin user + company with journals in the current fiscal year (Jan-Dec default),
// so the dashboard charts have real data without touching the shared admin/company used by other specs.
// Runs right after reset-db.ts, so it is always on a clean database (idempotent by construction).
const today = todayIso();
const year = today.slice(0, 4);
const month = Number(today.slice(5, 7));
const ym = (m: number) => `${year}-${String(m).padStart(2, '0')}`;
const prev = ym(Math.max(month - 1, 1));
const cur = ym(month);

const { companyId, bankAccountId } = await makeCompany('ZZ Grafik E2E');
const user = await makeUser({ email: E2E_CHARTS_EMAIL, name: 'Grafik E2E', password: E2E_PASSWORD });
await addMember(user.id, companyId, 'admin');
await saveOpening(companyId, user.id, {
	date: `${year}-01-01`,
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
