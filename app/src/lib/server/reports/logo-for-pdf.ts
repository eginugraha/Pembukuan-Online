import decodeWebp from '@jsquash/webp/decode';
import decodePng from '@jsquash/png/decode';
import encodePng from '@jsquash/png/encode';

/**
 * Logo perusahaan selalu disimpan sebagai WebP (lihat `src/lib/logo-resize.ts`), tapi `pdfkit`
 * hanya bisa menyisipkan PNG/JPEG. Konversi di sini sebelum `pdfkit` melihat bytes-nya.
 * Logo rusak/tidak terbaca harus dianggap "tanpa logo", bukan menggagalkan seluruh PDF.
 */
export async function toEmbeddablePng(content: Uint8Array, mime: string): Promise<Buffer | null> {
	if (mime !== 'image/webp') return Buffer.from(content);
	try {
		// decodeWebp wants an ArrayBuffer; .slice() copies into one sized exactly to `content`
		// (a plain Uint8Array's .buffer may be larger than its view, or a SharedArrayBuffer).
		const buffer = content.slice().buffer as ArrayBuffer;
		const imageData = await decodeWebp(buffer);
		const png = await encodePng(imageData);
		return Buffer.from(png);
	} catch {
		return null;
	}
}

/**
 * Versi ketat untuk gambar unggahan bebas (tanda tangan, watermark): PNG dan WebP di-decode penuh
 * lalu di-encode ulang sebagai PNG RGBA 8-bit, jadi `pdfkit` hanya pernah melihat PNG yang pasti
 * valid dan transparansinya tetap terjaga. Byte rusak (mis. header PNG + sampah) menjadi `null`
 * alih-alih membuat `pdfkit` gagal saat menyisipkan gambar. JPEG diteruskan apa adanya; pemanggil
 * tetap memvalidasinya lewat `doc.openImage`.
 */
export async function toSafePdfImage(content: Uint8Array, mime: string): Promise<Buffer | null> {
	if (mime === 'image/jpeg') return Buffer.from(content);
	if (mime !== 'image/png' && mime !== 'image/webp') return null;
	try {
		const buffer = content.slice().buffer as ArrayBuffer;
		const imageData = mime === 'image/webp' ? await decodeWebp(buffer) : await decodePng(buffer);
		if (!imageData) return null;
		return Buffer.from(await encodePng(imageData));
	} catch {
		return null;
	}
}
