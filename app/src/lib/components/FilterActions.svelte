<script lang="ts">
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';

	/** true bila nilai filter yang tampil berbeda dari defaultnya (bukan sekadar ada query string). */
	let { active }: { active: boolean } = $props();
	// Reset = buka halaman yang sama tanpa query, sehingga server memakai filter default.
</script>

<div class="flex items-end gap-2">
	<Button type="submit">Tampilkan</Button>
	{#if active}
		<Button href={page.url.pathname} variant="outline"><RotateCcw class="size-4" />Reset</Button>
	{:else}
		<Button variant="outline" disabled aria-disabled="true" title="Belum ada filter yang diubah"><RotateCcw class="size-4" />Reset</Button>
	{/if}
</div>
