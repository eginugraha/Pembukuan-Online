/**
 * Kunci pengelompokan deskripsi transaksi: uppercase, buang token yang mengandung angka
 * (tanggal, nomor referensi, nominal, kode cabang), buang tanda baca, rapikan spasi.
 */
export function normalizeDescription(description: string): string {
	return description
		.toUpperCase()
		.split(/\s+/)
		.filter((tok) => tok.length > 0 && !/\d/.test(tok))
		.map((tok) => tok.replace(/[^A-Z&\-.']/g, ''))
		.filter((tok) => tok.length > 0 && tok !== '-')
		.join(' ');
}
