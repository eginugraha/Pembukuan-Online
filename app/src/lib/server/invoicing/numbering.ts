import { eq, sql } from 'drizzle-orm';
import { formatDocumentNumber } from '../../document-number';
import { ApiError } from '../api';
import type { Tx } from '../db';
import { companies, documentNumberCounters } from '../db/schema';

/**
 * Reads the company code inside the caller's transaction; throws 422 `missing_company_code` when unset.
 * Call before `nextDocumentNumber` so a rejected create never bumps the counter.
 */
export async function requireCompanyCode(tx: Tx, companyId: string): Promise<string> {
	const [row] = await tx.select({ code: companies.code }).from(companies).where(eq(companies.id, companyId)).limit(1);
	if (!row?.code) throw new ApiError(422, 'missing_company_code', 'Isi kode perusahaan di Pengaturan Perusahaan sebelum membuat dokumen');
	return row.code;
}

export function requireContactCode(code: string | null): string {
	if (!code) throw new ApiError(422, 'missing_contact_code', 'Kontak ini belum punya kode. Isi kode kontak terlebih dahulu', undefined, { field: 'contactId' });
	return code;
}

/**
 * Returns the next document number for (company, kind, year of issueDate), e.g. `001/SET-XFORMATION/INV/IV/2026`.
 * The counter key is `${kind}:v2`, independent of the legacy `INV`/`PO` counter rows. The upsert is atomic at the
 * Postgres row level, so concurrent callers each get a distinct sequence value. Call it inside the same
 * transaction that inserts the document.
 */
export async function nextDocumentNumber(
	tx: Tx,
	companyId: string,
	o: { kind: 'INV' | 'PO' | 'RCP' | 'QUO'; issueDate: string; companyCode: string; contactCode: string }
): Promise<string> {
	const [row] = await tx
		.insert(documentNumberCounters)
		.values({ companyId, prefix: `${o.kind}:v2`, year: o.issueDate.slice(0, 4), lastSeq: 1 })
		.onConflictDoUpdate({
			target: [documentNumberCounters.companyId, documentNumberCounters.prefix, documentNumberCounters.year],
			set: { lastSeq: sql`${documentNumberCounters.lastSeq} + 1` }
		})
		.returning({ lastSeq: documentNumberCounters.lastSeq });

	return formatDocumentNumber({
		seq: row.lastSeq,
		companyCode: o.companyCode,
		contactCode: o.contactCode,
		kind: o.kind,
		issueDate: o.issueDate
	});
}
