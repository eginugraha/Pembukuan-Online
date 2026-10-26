import { and, eq } from 'drizzle-orm';
import { ApiError } from '../api';
import { db } from '../db';
import { companies, companyAssets } from '../db/schema';
import { MAX_LOGO_BYTES, sniffImage } from './logo';

export type CompanyAssetKind = 'signature' | 'watermark';

export const isAssetKind = (v: string): v is CompanyAssetKind => v === 'signature' || v === 'watermark';

const urlColumn = (kind: CompanyAssetKind) => (kind === 'signature' ? 'signatureUrl' : 'watermarkUrl');

export async function setCompanyAsset(companyId: string, kind: CompanyAssetKind, content: Uint8Array): Promise<string> {
	if (content.byteLength > MAX_LOGO_BYTES) throw new ApiError(400, 'image_too_large', 'Ukuran gambar maksimal 512 KB', undefined, { field: 'file' });
	const mime = sniffImage(content);
	if (!mime) throw new ApiError(400, 'invalid_image', 'Gambar harus berformat JPG, PNG, atau WebP', undefined, { field: 'file' });
	const now = new Date();
	const url = `/api/companies/${companyId}/assets/${kind}?v=${now.getTime()}`;
	await db.transaction(async (tx) => {
		await tx
			.insert(companyAssets)
			.values({ companyId, kind, content, mime, updatedAt: now })
			.onConflictDoUpdate({ target: [companyAssets.companyId, companyAssets.kind], set: { content, mime, updatedAt: now } });
		await tx.update(companies).set({ [urlColumn(kind)]: url }).where(eq(companies.id, companyId));
	});
	return url;
}

export async function removeCompanyAsset(companyId: string, kind: CompanyAssetKind): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(companyAssets).where(and(eq(companyAssets.companyId, companyId), eq(companyAssets.kind, kind)));
		await tx.update(companies).set({ [urlColumn(kind)]: null }).where(eq(companies.id, companyId));
	});
}

export async function getCompanyAsset(companyId: string, kind: CompanyAssetKind) {
	const row = await db.query.companyAssets.findFirst({ where: and(eq(companyAssets.companyId, companyId), eq(companyAssets.kind, kind)) });
	return row ? { content: row.content, mime: row.mime, updatedAt: row.updatedAt } : null;
}
