import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError } from '../api';
import { db } from '../db';
import { user, userAvatars } from '../db/schema';

// Klien sudah memotong & mengecilkan ke 256×256 WebP (biasanya < 50 KB); batas ini hanya pagar pengaman.
export const MAX_AVATAR_BYTES = 512 * 1024;

export const UpdateProfileInput = z.object({ name: z.string().trim().min(1).max(100) });

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/** Jenis gambar dari magic bytes, bukan dari nama file/Content-Type kiriman klien. */
function sniffImage(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
	if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
	return null;
}

export async function setAvatar(userId: string, content: Uint8Array): Promise<string> {
	if (content.byteLength > MAX_AVATAR_BYTES) throw new ApiError(400, 'image_too_large', 'Ukuran foto maksimal 512 KB setelah diperkecil');
	const mime = sniffImage(content);
	if (!mime) throw new ApiError(400, 'invalid_image', 'Foto harus berformat JPG, PNG, atau WebP');
	const now = new Date();
	const url = `/api/users/${userId}/avatar?v=${now.getTime()}`;
	await db.transaction(async (tx) => {
		await tx
			.insert(userAvatars)
			.values({ userId, content, mime, updatedAt: now })
			.onConflictDoUpdate({ target: userAvatars.userId, set: { content, mime, updatedAt: now } });
		await tx.update(user).set({ image: url, updatedAt: now }).where(eq(user.id, userId));
	});
	return url;
}

export async function removeAvatar(userId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(userAvatars).where(eq(userAvatars.userId, userId));
		await tx.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, userId));
	});
}

export async function getAvatar(userId: string) {
	const row = await db.query.userAvatars.findFirst({ where: eq(userAvatars.userId, userId) });
	return row ? { content: row.content, mime: row.mime, updatedAt: row.updatedAt } : null;
}

export async function updateProfileName(userId: string, name: string): Promise<void> {
	await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, userId));
}
