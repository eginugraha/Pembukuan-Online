<script lang="ts">
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';

	// Reset = buka halaman yang sama tanpa query, sehingga server memakai filter default.
	const hasFilter = $derived(page.url.search !== '');
</script>

<div class="flex items-end gap-2">
	<Button type="submit">Tampilkan</Button>
	{#if hasFilter}
		<Button href={page.url.pathname} variant="outline"><RotateCcw class="size-4" />Reset</Button>
	{:else}
		<Button variant="outline" disabled aria-disabled="true" title="Belum ada filter yang diubah"><RotateCcw class="size-4" />Reset</Button>
	{/if}
</div>
