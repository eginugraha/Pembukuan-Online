import decodeWebp from '@jsquash/webp/decode';
import encodePng from '@jsquash/png/encode';

/**
 * Logo perusahaan selalu disimpan sebagai WebP (lihat `src/lib/logo-crop.ts`), tapi `pdfkit`
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
