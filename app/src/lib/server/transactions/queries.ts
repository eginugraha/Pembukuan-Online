import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { accounts, journalEntries, statementUploads, transactions } from '../db/schema';

const acc = alias(accounts, 'acc');
const sug = alias(accounts, 'sug');

export async function listTransactions(companyId: string, filter: { uploadId?: string; pendingOnly?: boolean } = {}) {
	const conditions = [eq(transactions.companyId, companyId)];
	if (filter.uploadId) conditions.push(eq(transactions.uploadId, filter.uploadId));
	if (filter.pendingOnly) conditions.push(eq(transactions.isConfirmed, false));
	return db
		.select({
			id: transactions.id,
			uploadId: transactions.uploadId,
			uploadFilename: statementUploads.filename,
			lineNo: transactions.lineNo,
			txnDate: transactions.txnDate,
			description: transactions.description,
			debit: transactions.debit,
			credit: transactions.credit,
			balance: transactions.balance,
			isConfirmed: transactions.isConfirmed,
			source: transactions.source,
			aiConfidence: transactions.aiConfidence,
			aiReason: transactions.aiReason,
			aiKeyword: transactions.aiKeyword,
			groupKey: transactions.groupKey,
			accountId: transactions.accountId,
			accountCode: acc.code,
			accountName: acc.name,
			suggestedAccountId: transactions.aiSuggestedAccountId,
			suggestedCode: sug.code,
			suggestedName: sug.name,
			journalId: journalEntries.id
		})
		.from(transactions)
		.innerJoin(statementUploads, eq(statementUploads.id, transactions.uploadId))
		.leftJoin(acc, eq(acc.id, transactions.accountId))
		.leftJoin(sug, eq(sug.id, transactions.aiSuggestedAccountId))
		.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
		.where(and(...conditions))
		.orderBy(asc(statementUploads.periodStart), asc(transactions.uploadId), asc(transactions.lineNo));
}

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>[number];
