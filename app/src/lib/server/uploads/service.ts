import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { D, formatIdr } from '../../money';
import { ApiError, notFound } from '../api';
import { normalizeDescription } from '../categorize/normalize';
import { db } from '../db';
import { companies, journalEntries, statementUploads, transactions } from '../db/schema';
import { balanceAtStartOf } from '../ledger/balance';
import type { ParsedStatement } from './sidecar-client';

const MAX_BYTES = 10 * 1024 * 1024;

export interface UploadDeps {
	parse: (file: File) => Promise<ParsedStatement>;
	enqueue: (uploadId: string) => void;
}

async function validateFile(file: File): Promise<void> {
	if (!file.name.toLowerCase().endsWith('.pdf')) throw new ApiError(400, 'invalid_file', 'File harus berformat PDF');
	if (file.size > MAX_BYTES) throw new ApiError(400, 'file_too_large', 'Ukuran file maksimal 10 MB');
	const head = new TextDecoder().decode(await file.slice(0, 4).arrayBuffer());
	if (head !== '%PDF') throw new ApiError(400, 'invalid_file', 'File bukan PDF yang valid');
}

async function openingBalanceWarning(
	company: { id: string; bankAccountId: string | null },
	parsed: ParsedStatement
): Promise<string | null> {
	if (!company.bankAccountId) return null;
	const opening = await db.query.journalEntries.findFirst({
		where: and(eq(journalEntries.companyId, company.id), eq(journalEntries.type, 'OPENING'))
	});
	if (!opening) return null;
	const book = await balanceAtStartOf(db, company.id, company.bankAccountId, parsed.period_start);
	if (D(book).eq(parsed.opening_balance)) return null;
	return `Saldo awal di PDF (Rp ${formatIdr(parsed.opening_balance)}) berbeda dengan saldo Bank di buku per ${parsed.period_start} (Rp ${formatIdr(book)}).`;
}

export async function createUpload(
	input: { companyId: string; userId: string; file: File },
	deps: UploadDeps
): Promise<{ id: string; balanceWarning: string | null }> {
	await validateFile(input.file);
	const company = await db.query.companies.findFirst({ where: eq(companies.id, input.companyId) });
	if (!company) throw notFound('Perusahaan');

	const parsed = await deps.parse(input.file); // PDF hanya diteruskan dari memori (D12)

	const balanceWarning = await openingBalanceWarning(company, parsed);

	const id = await db.transaction(async (tx) => {
		// Cek duplikat di dalam lock baris perusahaan agar dua upload bersamaan tidak sama-sama lolos.
		await tx.execute(sql`select id from companies where id = ${company.id} for update`);
		const [duplicate] = await tx
			.select({ id: statementUploads.id })
			.from(statementUploads)
			.where(
				and(
					eq(statementUploads.companyId, company.id),
					eq(statementUploads.accountNo, parsed.account_no),
					lte(statementUploads.periodStart, parsed.period_end),
					gte(statementUploads.periodEnd, parsed.period_start)
				)
			)
			.limit(1);
		if (duplicate) {
			throw new ApiError(
				409,
				'duplicate_statement',
				`Statement rekening ${parsed.account_no} untuk periode ini sudah pernah diunggah. Hapus upload lama terlebih dahulu.`
			);
		}
		const [upload] = await tx
			.insert(statementUploads)
			.values({
				companyId: company.id,
				uploadedBy: input.userId,
				filename: input.file.name,
				accountNo: parsed.account_no,
				periodStart: parsed.period_start,
				periodEnd: parsed.period_end,
				openingBalance: parsed.opening_balance,
				closingBalance: parsed.closing_balance,
				status: 'processing',
				balanceWarning
			})
			.returning({ id: statementUploads.id });
		if (parsed.transactions.length > 0) {
			await tx.insert(transactions).values(
				parsed.transactions.map((t) => ({
					uploadId: upload.id,
					companyId: company.id,
					lineNo: t.line_no,
					txnDate: t.date,
					description: t.description,
					groupKey: normalizeDescription(t.description),
					debit: t.direction === 'DB' ? t.amount : '0',
					credit: t.direction === 'CR' ? t.amount : '0',
					balance: t.balance
				}))
			);
		}
		return upload.id;
	});

	deps.enqueue(id);
	return { id, balanceWarning };
}

export async function listUploads(companyId: string) {
	return db
		.select({
			id: statementUploads.id,
			filename: statementUploads.filename,
			accountNo: statementUploads.accountNo,
			periodStart: statementUploads.periodStart,
			periodEnd: statementUploads.periodEnd,
			status: statementUploads.status,
			aiStatus: statementUploads.aiStatus,
			balanceWarning: statementUploads.balanceWarning,
			uploadedAt: statementUploads.uploadedAt,
			total: sql<number>`count(${transactions.id})::int`,
			pending: sql<number>`(count(${transactions.id}) filter (where ${transactions.isConfirmed} = false))::int`
		})
		.from(statementUploads)
		.leftJoin(transactions, eq(transactions.uploadId, statementUploads.id))
		.where(eq(statementUploads.companyId, companyId))
		.groupBy(statementUploads.id)
		.orderBy(desc(statementUploads.uploadedAt));
}

export async function getUpload(companyId: string, uploadId: string) {
	const upload = await db.query.statementUploads.findFirst({
		where: and(eq(statementUploads.id, uploadId), eq(statementUploads.companyId, companyId))
	});
	if (!upload) throw notFound('Upload');
	return upload;
}

export async function deleteUpload(companyId: string, uploadId: string): Promise<void> {
	const deleted = await db
		.delete(statementUploads)
		.where(and(eq(statementUploads.id, uploadId), eq(statementUploads.companyId, companyId)))
		.returning({ id: statementUploads.id });
	if (deleted.length === 0) throw notFound('Upload');
}

export async function retryCategorization(
	companyId: string,
	uploadId: string,
	enqueue: (id: string) => void
): Promise<void> {
	const upload = await getUpload(companyId, uploadId);
	if (upload.status === 'processing') {
		throw new ApiError(409, 'already_processing', 'Upload ini sedang diproses');
	}
	await db
		.update(statementUploads)
		.set({ status: 'processing', errorMessage: null })
		.where(eq(statementUploads.id, uploadId));
	enqueue(uploadId);
}
