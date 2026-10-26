/** Sisi terpanjang logo setelah diperkecil. Logo tidak dipotong menjadi persegi: proporsinya tetap. */
export const LOGO_MAX_SIDE = 1024;

/** Ukuran hasil yang muat di dalam kotak `max`×`max` tanpa mengubah proporsi; tidak pernah diperbesar. */
export function fitSize(imgW: number, imgH: number, max = LOGO_MAX_SIDE): { width: number; height: number } {
	const scale = Math.min(1, max / imgW, max / imgH);
	return { width: Math.max(1, Math.round(imgW * scale)), height: Math.max(1, Math.round(imgH * scale)) };
}

export async function loadBitmap(file: File): Promise<ImageBitmap> {
	return createImageBitmap(file).catch(() => {
		throw new Error('Logo tidak bisa dibaca. Coba file lain.');
	});
}

/** Logo utuh (transparansi tetap) diperkecil bila perlu lalu disimpan sebagai WebP. */
export async function renderLogo(bitmap: ImageBitmap, max = LOGO_MAX_SIDE): Promise<Blob> {
	const { width, height } = fitSize(bitmap.width, bitmap.height, max);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Browser tidak mendukung pengolahan gambar');
	ctx.drawImage(bitmap, 0, 0, width, height);
	return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar'))), 'image/webp', 0.92));
}
