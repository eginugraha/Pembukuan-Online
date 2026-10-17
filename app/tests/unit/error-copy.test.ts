import { expect, test } from 'bun:test';
import { errorCopy } from '$lib/error-copy';

test('404 default and custom message', () => {
	expect(errorCopy(404)).toEqual({
		title: 'Halaman tidak ditemukan',
		body: 'Halaman yang Anda cari tidak ada atau sudah dipindahkan.',
		showReload: false
	});
	expect(errorCopy(404, 'Upload tidak ditemukan').body).toBe('Upload tidak ditemukan');
});

test('500 always generic and offers reload', () => {
	const generic = { title: 'Terjadi kesalahan', body: 'Maaf, ada masalah di server. Coba lagi beberapa saat lagi.', showReload: true };
	expect(errorCopy(500)).toEqual(generic);
	expect(errorCopy(500, 'detail rahasia')).toEqual(generic);
	expect(errorCopy(503, 'x')).toEqual(generic);
});

test('403, 400 and other statuses', () => {
	expect(errorCopy(403)).toEqual({ title: 'Akses ditolak', body: 'Anda tidak punya akses ke halaman ini.', showReload: false });
	expect(errorCopy(403, 'Bukan hak Anda').body).toBe('Bukan hak Anda');
	expect(errorCopy(400)).toEqual({ title: 'Permintaan tidak valid', body: 'Periksa kembali isian Anda.', showReload: false });
	expect(errorCopy(400, 'Salah').body).toBe('Salah');
	expect(errorCopy(418)).toEqual({ title: 'Terjadi kesalahan', body: 'Silakan coba lagi.', showReload: false });
	expect(errorCopy(409, 'Bentrok').body).toBe('Bentrok');
});
