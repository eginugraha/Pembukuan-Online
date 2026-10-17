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

	await expect(
		(async () => {
		await db.insert(fiscalClosings).values({
			companyId,
			periodStart: '2026-01-01',
			periodEnd: '2026-12-31',
			retainedEarningsAccountId: retained
		});
		})()
	).rejects.toThrow();

	await db.delete(companies).where(eq(companies.id, companyId));
	expect(await db.select().from(fiscalClosings)).toHaveLength(0);
});
