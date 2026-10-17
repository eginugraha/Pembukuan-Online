import { beforeEach, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { companies, fiscalClosings, journalEntries } from '../../src/lib/server/db/schema';
import { accountIdByCode, makeCompany } from './factory';
import { resetDb } from './db';

beforeEach(resetDb);

test('closing journal type and fiscal_closings row can be stored', async () => {
	const { companyId } = await makeCompany();
	const retained = await accountIdByCode(companyId, '3-1003');
	const [entry] = await db
		.insert(journalEntries)
		.values({ companyId, type: 'CLOSING', entryDate: '2026-12-31', description: 'Penutup' })
		.returning();
	await db.insert(fiscalClosings).values({
		companyId,
		periodStart: '2026-01-01',
		periodEnd: '2026-12-31',
		journalId: entry.id,
		retainedEarningsAccountId: retained
	});

	const dup = await db
		.insert(fiscalClosings)
		.values({ companyId, periodStart: '2026-01-01', periodEnd: '2026-12-31', retainedEarningsAccountId: retained })
		.then(() => null, (e) => e);
	expect(dup).not.toBeNull();
	const pg = dup.cause ?? dup;
	expect(pg.code).toBe('23505');
	if (pg.constraint_name ?? pg.constraint) expect(pg.constraint_name ?? pg.constraint).toBe('fiscal_closings_company_start_uq');

	await db.delete(companies).where(eq(companies.id, companyId));
	expect(await db.select().from(fiscalClosings).where(eq(fiscalClosings.companyId, companyId))).toHaveLength(0);
});
