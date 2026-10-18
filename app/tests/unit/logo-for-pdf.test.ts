import { expect, test } from 'bun:test';
import { toEmbeddablePng } from '../../src/lib/server/reports/logo-for-pdf';

// 1x1 red pixel, lossless WebP (RIFF/WEBP/VP8L), verified to decode during planning.
const WEBP_1X1 = Buffer.from('UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64');
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('converts a WebP logo to an embeddable PNG', async () => {
	const png = await toEmbeddablePng(WEBP_1X1, 'image/webp');
	expect(png).not.toBeNull();
	expect([...png!.subarray(0, 8)]).toEqual(PNG_MAGIC);
});

test('passes PNG/JPEG through unchanged (pdfkit already reads them natively)', async () => {
	const fakePng = Buffer.from(PNG_MAGIC);
	expect(await toEmbeddablePng(fakePng, 'image/png')).toEqual(fakePng);
});

test('corrupt image bytes are treated as "no logo", not a thrown error', async () => {
	expect(await toEmbeddablePng(Buffer.from('not an image'), 'image/webp')).toBeNull();
});
