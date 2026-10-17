import { z } from 'zod';
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
