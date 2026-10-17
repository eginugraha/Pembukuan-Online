export function errorCopy(status: number, message?: string): { title: string; body: string; showReload: boolean } {
	if (status === 404)
		return { title: 'Halaman tidak ditemukan', body: message ?? 'Halaman yang Anda cari tidak ada atau sudah dipindahkan.', showReload: false };
	if (status >= 500)
		return { title: 'Terjadi kesalahan', body: 'Maaf, ada masalah di server. Coba lagi beberapa saat lagi.', showReload: true };
	if (status === 403) return { title: 'Akses ditolak', body: message ?? 'Anda tidak punya akses ke halaman ini.', showReload: false };
	if (status === 400) return { title: 'Permintaan tidak valid', body: message ?? 'Periksa kembali isian Anda.', showReload: false };
	return { title: 'Terjadi kesalahan', body: message ?? 'Silakan coba lagi.', showReload: false };
}
