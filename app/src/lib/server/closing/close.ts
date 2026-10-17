import { and, count, eq, exists, inArray, isNull, lt, gte, lte, ne, sql } from 'drizzle-orm';
import { D, toMoney } from '../../money';
import { dayAfter, fiscalYearEnd, fiscalYearLabel, fiscalYearStart } from '../../periods';
import { todayIso } from '../../dates';
import { ApiError, notFound } from '../api';
import { assertLeafAccount } from '../accounts/queries';
import { db } from '../db';
import {
	accounts,
	companies,
	fiscalClosings,
	journalEntries,
	journalLines,
	statementUploads,
	transactions
} from '../db/schema';
import { lockedThrough } from './years';

export { CloseInput } from '../../schemas/closing';

export async function closeFiscalYear(
	companyId: string,
	userId: string,
	input: { periodStart: string; retainedEarningsAccountId: string },
	today: string = todayIso()
): Promise<{ journalId: string | null }> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);
		const company = await tx.query.companies.findFirst({ where: eq(companies.id, companyId) });
		if (!company) throw notFound('Perusahaan');

		const { periodStart } = input;
		if (fiscalYearStart(periodStart, company.fiscalYear) !== periodStart) {
			throw new ApiError(422, 'invalid_period', 'Periode harus dimulai di awal tahun buku', undefined, { field: 'periodStart' });
		}
		const periodEnd = fiscalYearEnd(periodStart);
		const label = fiscalYearLabel(periodStart, periodEnd);

		const existing = await tx.query.fiscalClosings.findFirst({
			where: and(eq(fiscalClosings.companyId, companyId), eq(fiscalClosings.periodStart, periodStart))
		});
		if (existing) throw new ApiError(409, 'already_closed', `Tahun buku ${label} sudah ditutup`);

		if (periodEnd >= today) throw new ApiError(409, 'year_not_ended', `Tahun buku ${label} belum berakhir`);

		const locked = await lockedThrough(tx, companyId);
		const previousOpen = new ApiError(409, 'previous_year_open', 'Tutup dulu tahun buku sebelumnya');
		if (locked) {
			if (periodStart !== dayAfter(locked.periodEnd)) throw previousOpen;
		} else {
			const [{ n }] = await tx
				.select({ n: count() })
				.from(journalEntries)
				.where(
					and(
						eq(journalEntries.companyId, companyId),
						ne(journalEntries.type, 'OPENING'),
						lt(journalEntries.entryDate, periodStart)
					)
				);
			if (n > 0) throw previousOpen;
		}

		const upToEnd = and(
			eq(transactions.companyId, companyId),
			lte(transactions.txnDate, periodEnd)
		);
		const [{ unconfirmed }] = await tx
			.select({ unconfirmed: count() })
			.from(transactions)
			.where(and(upToEnd, eq(transactions.isConfirmed, false)));
		const [{ processing }] = await tx
			.select({ processing: count() })
			.from(statementUploads)
			.where(
				and(
					eq(statementUploads.companyId, companyId),
					inArray(statementUploads.status, ['processing', 'review']),
					exists(
						tx
							.select({ one: sql`1` })
							.from(transactions)
							.where(and(eq(transactions.uploadId, statementUploads.id), upToEnd))
					)
				)
			);
		if (unconfirmed > 0) {
			throw new ApiError(409, 'pending_transactions', `Masih ada ${unconfirmed} transaksi yang belum dikonfirmasi sampai akhir tahun buku ${label}`);
		}
		if (processing > 0) {
			throw new ApiError(409, 'pending_transactions', `Masih ada upload yang sedang diproses sampai akhir tahun buku ${label}`);
		}

		const [{ ungenerated }] = await tx
			.select({ ungenerated: count() })
			.from(transactions)
			.leftJoin(journalEntries, eq(journalEntries.transactionId, transactions.id))
			.where(and(upToEnd, eq(transactions.isConfirmed, true), isNull(journalEntries.id)));
		if (ungenerated > 0) {
			throw new ApiError(409, 'journal_not_generated', `${ungenerated} transaksi sampai akhir tahun buku ${label} belum dibuatkan jurnal`);
		}

		const invalidRe = () =>
			new ApiError(422, 'invalid_retained_earnings', 'Akun laba ditahan harus akun Ekuitas yang aktif dan berupa akun detail', undefined, {
				field: 'retainedEarningsAccountId'
			});
		let retained;
		try {
			retained = await assertLeafAccount(tx, companyId, input.retainedEarningsAccountId);
		} catch (e) {
			if (e instanceof ApiError) throw invalidRe();
			throw e;
		}
		if (retained.type !== 'EQUITY') throw invalidRe();

		const balances = await tx
			.select({
				accountId: journalLines.accountId,
				net: sql<string>`sum(${journalLines.debit} - ${journalLines.credit})`
			})
			.from(journalLines)
			.innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalId))
			.innerJoin(accounts, eq(accounts.id, journalLines.accountId))
			.where(
				and(
					eq(journalEntries.companyId, companyId),
					ne(journalEntries.type, 'CLOSING'),
					gte(journalEntries.entryDate, periodStart),
					lte(journalEntries.entryDate, periodEnd),
					inArray(accounts.type, ['REVENUE', 'EXPENSE'])
				)
			)
			.groupBy(journalLines.accountId);

		const lines: { accountId: string; debit: string; credit: string }[] = [];
		let total = D(0);
		for (const b of balances) {
			const net = D(b.net);
			if (net.isZero()) continue;
			total = total.plus(net);
			lines.push({
				accountId: b.accountId,
				debit: net.lt(0) ? toMoney(net.neg()) : '0.00',
				credit: net.gt(0) ? toMoney(net) : '0.00'
			});
		}

		let journalId: string | null = null;
		if (lines.length > 0) {
			lines.push({
				accountId: retained.id,
				debit: total.gt(0) ? toMoney(total) : '0.00',
				credit: total.lt(0) ? toMoney(total.neg()) : '0.00'
			});
			const [je] = await tx
				.insert(journalEntries)
				.values({
					companyId,
					type: 'CLOSING',
					entryDate: periodEnd,
					refNo: `TUTUP-${label}`,
					description: `Jurnal penutup tahun buku ${label}`,
					createdBy: userId
				})
				.returning({ id: journalEntries.id });
			await tx.insert(journalLines).values(lines.map((l) => ({ journalId: je.id, ...l })));
			journalId = je.id;
		}

		await tx.insert(fiscalClosings).values({
			companyId,
			periodStart,
			periodEnd,
			journalId,
			retainedEarningsAccountId: retained.id,
			closedBy: userId
		});
		return { journalId };
	});
}

export async function reopenFiscalYear(companyId: string, periodStart: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`select id from companies where id = ${companyId} for update`);
		const row = await tx.query.fiscalClosings.findFirst({
			where: and(eq(fiscalClosings.companyId, companyId), eq(fiscalClosings.periodStart, periodStart))
		});
		if (!row) throw notFound('Tutup buku');
		const [{ later }] = await tx
			.select({ later: count() })
			.from(fiscalClosings)
			.where(and(eq(fiscalClosings.companyId, companyId), sql`${fiscalClosings.periodStart} > ${periodStart}`));
		if (later > 0) {
			throw new ApiError(409, 'not_latest_closing', 'Hanya tahun buku yang terakhir ditutup yang bisa dibuka kembali');
		}
		await tx.delete(fiscalClosings).where(eq(fiscalClosings.id, row.id));
		if (row.journalId) await tx.delete(journalEntries).where(eq(journalEntries.id, row.journalId));
	});
}
