export const LOGO_OUTPUT_SIZE = 512;
export const LOGO_MAX_ZOOM = 4;

export interface LogoCrop {
	zoom: number;
	panX: number;
	panY: number;
}

export function containScale(imgW: number, imgH: number, box = LOGO_OUTPUT_SIZE): number {
	return Math.min(box / imgW, box / imgH);
}

function axisOffset(size: number, box: number, pan: number): number {
	return size <= box ? (box - size) / 2 : -(size - box) * pan;
}

export function drawParams(imgW: number, imgH: number, crop: LogoCrop, box = LOGO_OUTPUT_SIZE) {
	const scale = containScale(imgW, imgH, box) * crop.zoom;
	const dw = imgW * scale;
	const dh = imgH * scale;
	return { dx: axisOffset(dw, box, crop.panX), dy: axisOffset(dh, box, crop.panY), dw, dh };
}

export async function loadBitmap(file: File): Promise<ImageBitmap> {
	return createImageBitmap(file).catch(() => {
		throw new Error('Logo tidak bisa dibaca. Coba file lain.');
	});
}

export function drawInto(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap, crop: LogoCrop, box = LOGO_OUTPUT_SIZE): void {
	ctx.clearRect(0, 0, box, box);
	const { dx, dy, dw, dh } = drawParams(bitmap.width, bitmap.height, crop, box);
	ctx.drawImage(bitmap, dx, dy, dw, dh);
}

export async function renderLogoCrop(bitmap: ImageBitmap, crop: LogoCrop, box = LOGO_OUTPUT_SIZE): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = box;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Browser tidak mendukung pengolahan gambar');
	drawInto(ctx, bitmap, crop, box);
	return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar'))), 'image/webp', 0.92));
}
