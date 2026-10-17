import { z } from 'zod';
import { fiscalYearStart } from '../periods';
import { ApiError, notFound } from './api';

export { isoDate, moneyString } from '../schemas/common';
// Untuk parameter URL (?from=…) cukup format ISO tanpa pesan form.
const isoDateParam = z.iso.date();
export const uuidSchema = z.uuid();

/** Validasi ID dari URL; ID yang bukan UUID diperlakukan sebagai "tidak ditemukan". */
export function parseId(value: string | undefined | null, what = 'Data'): string {
	const r = uuidSchema.safeParse(value);
	if (!r.success) throw notFound(what);
	return r.data;
}

export function dateParam(url: URL, name: string): string | null {
	const v = url.searchParams.get(name);
	if (!v) return null;
	const r = isoDateParam.safeParse(v);
	if (!r.success) throw new ApiError(400, 'validation_error', `Parameter ${name} harus berformat YYYY-MM-DD`);
	return r.data;
}

/** Rentang ?from&to; bila hanya ?as_of, rentangnya dari awal tahun buku sampai as_of. */
export function rangeParams(
	url: URL,
	defaults: { from: string; to: string },
	startMonth: string
): { from: string; to: string } {
	const from = dateParam(url, 'from');
	const to = dateParam(url, 'to');
	const asOf = dateParam(url, 'as_of');
	if (!from && !to && asOf) return { from: fiscalYearStart(asOf, startMonth), to: asOf };
	const range = { from: from ?? defaults.from, to: to ?? defaults.to };
	if (range.from > range.to) {
		throw new ApiError(400, 'invalid_range', 'Tanggal awal harus sebelum tanggal akhir', undefined, { field: 'from' });
	}
	return range;
}
