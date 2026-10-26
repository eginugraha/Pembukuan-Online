import { z } from 'zod';

// Skema dasar dengan pesan Bahasa Indonesia; dipakai bersama oleh form (klien) dan API (server).
export const requiredText = (label: string, max: number) =>
	z
		.string({ error: `${label} wajib diisi` })
		.trim()
		.min(1, `${label} wajib diisi`)
		.max(max, `${label} maksimal ${max} karakter`);

export const optionalText = (label: string, max: number) =>
	z.string().trim().max(max, `${label} maksimal ${max} karakter`).nullable().optional();

// Kode perusahaan/kontak untuk nomor dokumen. String kosong dianggap null (kode belum diisi).
export const documentCode = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
	z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z0-9]{1,15}$/, 'Kode hanya huruf A–Z dan angka, maksimal 15 karakter')
		.nullable()
		.optional()
);

export const requiredId = (label: string) => z.uuid({ error: `${label} wajib dipilih` });

export const emailField = z
	.string({ error: 'Email wajib diisi' })
	.trim()
	.min(1, 'Email wajib diisi')
	.pipe(z.email('Format email tidak valid'));

export const moneyString = z
	.string()
	.trim()
	.regex(/^\d{1,16}(\.\d{1,2})?$/, 'Format nominal tidak valid (contoh: 1500000.00)');

export const isoDate = z
	.string({ error: 'Tanggal wajib diisi' })
	.min(1, 'Tanggal wajib diisi')
	.pipe(z.iso.date('Format tanggal tidak valid'));
