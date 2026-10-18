<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		LOGO_MAX_ZOOM,
		LOGO_OUTPUT_SIZE,
		drawInto,
		drawParams,
		loadBitmap,
		renderLogoCrop,
		type LogoCrop
	} from '$lib/logo-crop';

	let { file, onconfirm, oncancel }: { file: File; onconfirm: (blob: Blob) => void; oncancel: () => void } = $props();

	let open = $state(true);
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let bitmap: ImageBitmap | null = $state(null);
	let crop: LogoCrop = $state({ zoom: 1, panX: 0.5, panY: 0.5 });
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	type Drag = { pointerId: number; startX: number; startY: number; startPanX: number; startPanY: number };
	let drag: Drag | null = null;

	function clamp(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}

	$effect(() => {
		bitmap = null;
		errorMessage = null;
		crop = { zoom: 1, panX: 0.5, panY: 0.5 };
		loadBitmap(file)
			.then((b) => {
				bitmap = b;
			})
			.catch((err: unknown) => {
				errorMessage = err instanceof Error ? err.message : 'Logo tidak bisa dibaca. Coba file lain.';
			});
	});

	$effect(() => {
		if (!canvasEl || !bitmap) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		drawInto(ctx, bitmap, crop);
	});

	function onPointerDown(e: PointerEvent) {
		if (!bitmap || !canvasEl) return;
		canvasEl.setPointerCapture(e.pointerId);
		drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startPanX: crop.panX, startPanY: crop.panY };
	}

	function onPointerMove(e: PointerEvent) {
		if (!drag || !bitmap || !canvasEl || drag.pointerId !== e.pointerId) return;
		const { dw, dh } = drawParams(bitmap.width, bitmap.height, crop);
		const freeRangeX = Math.max(dw - LOGO_OUTPUT_SIZE, 0.001);
		const freeRangeY = Math.max(dh - LOGO_OUTPUT_SIZE, 0.001);
		const displayW = canvasEl.clientWidth || LOGO_OUTPUT_SIZE;
		const displayH = canvasEl.clientHeight || LOGO_OUTPUT_SIZE;
		const deltaX = e.clientX - drag.startX;
		const deltaY = e.clientY - drag.startY;
		crop.panX = clamp(drag.startPanX - (deltaX / displayW) * (dw / freeRangeX), 0, 1);
		crop.panY = clamp(drag.startPanY - (deltaY / displayH) * (dh / freeRangeY), 0, 1);
	}

	function onPointerUp(e: PointerEvent) {
		if (!drag || drag.pointerId !== e.pointerId) return;
		canvasEl?.releasePointerCapture(e.pointerId);
		drag = null;
	}

	async function confirm() {
		if (!bitmap) return;
		busy = true;
		errorMessage = null;
		try {
			const blob = await renderLogoCrop(bitmap, crop);
			onconfirm(blob);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Gagal memproses gambar';
		} finally {
			busy = false;
		}
	}

	function cancel() {
		oncancel();
	}
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && oncancel()}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Atur Logo</Dialog.Title>
			<Dialog.Description>Geser untuk memindahkan, gunakan slider untuk memperbesar.</Dialog.Description>
		</Dialog.Header>
		{#if errorMessage}
			<p class="text-sm text-destructive">{errorMessage}</p>
		{:else}
			<div class="flex flex-col items-center gap-4">
				<canvas
					bind:this={canvasEl}
					width={LOGO_OUTPUT_SIZE}
					height={LOGO_OUTPUT_SIZE}
					class="h-64 w-64 touch-none rounded-xl border border-border bg-muted"
					class:cursor-grab={bitmap}
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={onPointerUp}
					onpointercancel={onPointerUp}
				></canvas>
				<input
					type="range"
					min="1"
					max={LOGO_MAX_ZOOM}
					step="0.01"
					bind:value={crop.zoom}
					disabled={!bitmap}
					aria-label="Perbesar logo"
					class="w-full"
				/>
			</div>
		{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={cancel}>Batal</Button>
			<Button type="button" onclick={confirm} disabled={!bitmap || busy}>Gunakan</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
