import { eq } from 'drizzle-orm';
import { ApiError } from '../api';
import { db } from '../db';
import { companies, companyLogos } from '../db/schema';

// Klien sudah memotong & mengecilkan logo (biasanya < 50 KB); batas ini hanya pagar pengaman.
export const MAX_LOGO_BYTES = 512 * 1024;

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/** Jenis gambar dari magic bytes, bukan dari nama file/Content-Type kiriman klien. */
export function sniffImage(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
	if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
	return null;
}

export async function setCompanyLogo(companyId: string, content: Uint8Array): Promise<string> {
	if (content.byteLength > MAX_LOGO_BYTES) throw new ApiError(400, 'image_too_large', 'Ukuran logo maksimal 512 KB setelah diperkecil', undefined, { field: 'file' });
	const mime = sniffImage(content);
	if (!mime) throw new ApiError(400, 'invalid_image', 'Logo harus berformat JPG, PNG, atau WebP', undefined, { field: 'file' });
	const now = new Date();
	const url = `/api/companies/${companyId}/logo?v=${now.getTime()}`;
	await db.transaction(async (tx) => {
		await tx
			.insert(companyLogos)
			.values({ companyId, content, mime, updatedAt: now })
			.onConflictDoUpdate({ target: companyLogos.companyId, set: { content, mime, updatedAt: now } });
		await tx.update(companies).set({ logoUrl: url }).where(eq(companies.id, companyId));
	});
	return url;
}

export async function removeCompanyLogo(companyId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(companyLogos).where(eq(companyLogos.companyId, companyId));
		await tx.update(companies).set({ logoUrl: null }).where(eq(companies.id, companyId));
	});
}

export async function getCompanyLogo(companyId: string) {
	const row = await db.query.companyLogos.findFirst({ where: eq(companyLogos.companyId, companyId) });
	return row ? { content: row.content, mime: row.mime, updatedAt: row.updatedAt } : null;
}
