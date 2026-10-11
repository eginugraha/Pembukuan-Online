import { and, count, eq, sql } from 'drizzle-orm';
import type { Executor } from '../db';
import { statementUploads, transactions } from '../db/schema';

export async function settleUploadStatus(ex: Executor, uploadId: string): Promise<'review' | 'done'> {
	const [{ pending }] = await ex
		.select({ pending: count() })
		.from(transactions)
		.where(and(eq(transactions.uploadId, uploadId), eq(transactions.isConfirmed, false)));
	const status = pending > 0 ? 'review' : 'done';
	await ex.update(statementUploads).set({ status }).where(eq(statementUploads.id, uploadId));
	return status;
}

/** Upload berstatus review yang semua transaksinya sudah confirmed → done. */
export async function refreshReviewedUploads(ex: Executor, companyId: string): Promise<void> {
	await ex.execute(sql`
		update statement_uploads su set status = 'done'
		where su.company_id = ${companyId} and su.status = 'review'
		  and not exists (select 1 from transactions t where t.upload_id = su.id and t.is_confirmed = false)
	`);
}

export async function markUploadError(ex: Executor, uploadId: string, message: string): Promise<void> {
	await ex.update(statementUploads).set({ status: 'error', errorMessage: message }).where(eq(statementUploads.id, uploadId));
}
