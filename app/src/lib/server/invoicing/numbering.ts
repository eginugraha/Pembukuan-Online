import { sql } from 'drizzle-orm';
import type { Tx } from '../db';
import { documentNumberCounters } from '../db/schema';

/**
 * Returns the next document number for (company, prefix, year), e.g. `INV-2026-0001`.
 * The upsert is atomic at the Postgres row level, so concurrent callers each get a distinct
 * sequence value without a separate lock. Call it inside the same transaction that inserts the document.
 */
export async function nextDocumentNumber(
	tx: Tx,
	companyId: string,
	prefix: 'INV' | 'PO',
	year: string
): Promise<string> {
	const [row] = await tx
		.insert(documentNumberCounters)
		.values({ companyId, prefix, year, lastSeq: 1 })
		.onConflictDoUpdate({
			target: [
				documentNumberCounters.companyId,
				documentNumberCounters.prefix,
				documentNumberCounters.year
			],
			set: { lastSeq: sql`${documentNumberCounters.lastSeq} + 1` }
		})
		.returning({ lastSeq: documentNumberCounters.lastSeq });

	return `${prefix}-${year}-${String(row.lastSeq).padStart(4, '0')}`;
}
