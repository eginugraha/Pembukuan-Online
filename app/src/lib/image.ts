export const AVATAR_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;

/**
 * Potong bagian tengah gambar menjadi persegi lalu kecilkan ke `size`×`size`, di browser.
 * Hasil WebP (fallback PNG bila browser tidak bisa encode WebP). Juga membuang metadata EXIF/GPS.
 */
export async function squareResize(file: File, size = 256): Promise<Blob> {
	const bitmap = await createImageBitmap(file).catch(() => {
		throw new Error('Foto tidak bisa dibaca. Coba file lain.');
	});
	const side = Math.min(bitmap.width, bitmap.height);
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Browser tidak mendukung pengolahan gambar');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
	bitmap.close();
	return new Promise((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar'))), 'image/webp', 0.9)
	);
}
