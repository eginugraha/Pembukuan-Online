import { z } from 'zod';
import { ApiError, notFound } from './api';

export const moneyString = z
	.string()
	.trim()
	.regex(/^\d{1,16}(\.\d{1,2})?$/, 'Format nominal tidak valid (contoh: 1500000.00)');
export const isoDate = z.iso.date();
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
	const r = isoDate.safeParse(v);
	if (!r.success) throw new ApiError(400, 'validation_error', `Parameter ${name} harus berformat YYYY-MM-DD`);
	return r.data;
}
