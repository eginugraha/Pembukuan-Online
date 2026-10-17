import { and, eq, gte, lte } from 'drizzle-orm';
import { fiscalYearLabel } from '../../periods';
import { ApiError } from '../api';
import type { Executor } from '../db';
import { fiscalClosings } from '../db/schema';
import { lockedThrough } from './years';

const closedError = (label: string) =>
	new ApiError(409, 'period_closed', `Tahun buku ${label} sudah ditutup. Buka kembali dulu untuk mengubah.`);

/**
 * Tolak penulisan pada tanggal yang terkunci (date <= periodEnd tahun tertutup terakhir). Panggil SETELAH
 * mengambil lock baris perusahaan agar tidak berpacu dengan tutup buku yang bersamaan.
 */
export async function assertPeriodOpen(ex: Executor, companyId: string, dates: string[]): Promise<void> {
	if (dates.length === 0) return;
	const locked = await lockedThrough(ex, companyId);
	if (!locked) return;
	const hit = dates.filter((d) => d <= locked.periodEnd).sort()[0];
	if (!hit) return;
	const [containing] = await ex
		.select({ periodStart: fiscalClosings.periodStart, periodEnd: fiscalClosings.periodEnd })
		.from(fiscalClosings)
		.where(and(eq(fiscalClosings.companyId, companyId), lte(fiscalClosings.periodStart, hit), gte(fiscalClosings.periodEnd, hit)))
		.limit(1);
	throw closedError(containing ? fiscalYearLabel(containing.periodStart, containing.periodEnd) : locked.label);
}

/** Saldo Awal tidak boleh diubah bila ada tutup buku apa pun; pesan memakai label tahun tertutup terakhir. */
export async function assertNoClosing(ex: Executor, companyId: string): Promise<void> {
	const locked = await lockedThrough(ex, companyId);
	if (locked) throw closedError(locked.label);
}
