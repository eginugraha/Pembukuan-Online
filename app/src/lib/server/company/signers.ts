import { and, asc, eq } from 'drizzle-orm';
import { ApiError, notFound } from '../api';
import { db } from '../db';
import { companySigners, invoices, paymentReceipts, purchaseOrders } from '../db/schema';
import { MAX_LOGO_BYTES, sniffImage } from './logo';

export interface SignerInput {
	name: string;
	title: string | null;
	/** `undefined` = gambar tidak diubah, `null` = hapus gambar. */
	image?: Uint8Array | null;
}

function checkImage(content: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' {
	if (content.byteLength > MAX_LOGO_BYTES) throw new ApiError(400, 'image_too_large', 'Ukuran gambar maksimal 512 KB', undefined, { field: 'file' });
	const mime = sniffImage(content);
	if (!mime) throw new ApiError(400, 'invalid_image', 'Gambar harus berformat JPG, PNG, atau WebP', undefined, { field: 'file' });
	return mime;
}

function checkName(input: SignerInput): void {
	if (!input.name.trim()) throw new ApiError(400, 'validation_error', 'Nama penandatangan wajib diisi', undefined, { field: 'name' });
}

const imageColumns = (image: SignerInput['image']) =>
	image === undefined ? {} : image === null ? { content: null, mime: null } : { content: image, mime: checkImage(image) };

/** Daftar tanpa isi gambar; urutan pembuatan, jadi yang pertama ada di atas. */
export async function listSigners(companyId: string) {
	const rows = await db
		.select({ id: companySigners.id, name: companySigners.name, title: companySigners.title, hasImage: companySigners.mime })
		.from(companySigners)
		.where(eq(companySigners.companyId, companyId))
		.orderBy(asc(companySigners.createdAt), asc(companySigners.id));
	return rows.map((r) => ({ ...r, hasImage: r.hasImage !== null }));
}

export type SignerOption = Awaited<ReturnType<typeof listSigners>>[number];

export async function getSigner(companyId: string, id: string) {
	const row = await db.query.companySigners.findFirst({ where: and(eq(companySigners.id, id), eq(companySigners.companyId, companyId)) });
	if (!row) throw notFound('Penandatangan');
	return row;
}

export async function createSigner(companyId: string, input: SignerInput): Promise<string> {
	checkName(input);
	const [row] = await db
		.insert(companySigners)
		.values({ companyId, name: input.name.trim(), title: input.title?.trim() || null, ...imageColumns(input.image) })
		.returning({ id: companySigners.id });
	return row.id;
}

export async function updateSigner(companyId: string, id: string, input: SignerInput): Promise<void> {
	checkName(input);
	const updated = await db
		.update(companySigners)
		.set({ name: input.name.trim(), title: input.title?.trim() || null, ...imageColumns(input.image) })
		.where(and(eq(companySigners.id, id), eq(companySigners.companyId, companyId)))
		.returning({ id: companySigners.id });
	if (updated.length === 0) throw notFound('Penandatangan');
}

export async function deleteSigner(companyId: string, id: string): Promise<void> {
	const deleted = await db
		.delete(companySigners)
		.where(and(eq(companySigners.id, id), eq(companySigners.companyId, companyId)))
		.returning({ id: companySigners.id });
	if (deleted.length === 0) throw notFound('Penandatangan');
}

/**
 * Penandatangan untuk satu unduhan: pilihan eksplisit, kalau tidak yang terakhir dipakai dokumen itu,
 * kalau tidak yang pertama di daftar. `null` bila perusahaan belum punya penandatangan.
 */
export async function resolveSignerId(companyId: string, chosen: string | null, last: string | null): Promise<string | null> {
	if (chosen) return (await getSigner(companyId, chosen)).id;
	const all = await listSigners(companyId);
	return all.find((s) => s.id === last)?.id ?? all[0]?.id ?? null;
}

type SignedDocTable = typeof invoices | typeof paymentReceipts | typeof purchaseOrders;

/**
 * Penandatangan untuk unduhan PDF satu dokumen. Pilihan eksplisit (`?signer=`) diingat di dokumen
 * sebagai pilihan awal unduhan berikutnya.
 */
export async function signerForDownload(
	companyId: string,
	table: SignedDocTable,
	doc: { id: string; lastSignerId: string | null },
	chosen: string | null
): Promise<string | null> {
	const signerId = await resolveSignerId(companyId, chosen, doc.lastSignerId);
	if (chosen && signerId && signerId !== doc.lastSignerId) {
		await db.update(table).set({ lastSignerId: signerId }).where(and(eq(table.id, doc.id), eq(table.companyId, companyId)));
	}
	return signerId;
}
