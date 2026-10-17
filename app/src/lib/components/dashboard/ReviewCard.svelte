<script lang="ts">
	import ListChecks from '@lucide/svelte/icons/list-checks';
	let { pendingCount, canReview }: { pendingCount: number; canReview: boolean } = $props();
</script>

<div class="relative flex min-h-40 flex-col justify-between overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#ffffff,#f1fbe9)] p-5 shadow-[0_22px_34px_-24px_rgb(62_110_28/0.6)]">
	<div class="flex items-start justify-between">
		<p class="text-xs font-semibold text-ink/80">Status Review</p>
		{#if canReview && pendingCount > 0}
			<a href="/review" class="text-[11px] font-medium text-deep underline underline-offset-2 opacity-75 hover:opacity-100">Buka Review</a>
		{/if}
	</div>
	<div class="flex items-center gap-4">
		<span class="icon-tile icon-tile-solid size-14 shrink-0 rounded-2xl"><ListChecks class="size-7" /></span>
		<div>
			{#if pendingCount > 0}
				<p class="text-xl font-extrabold text-deep">{pendingCount} transaksi</p>
				<p class="text-sm font-medium text-ink/70">menunggu konfirmasi</p>
			{:else}
				<p class="text-xl font-extrabold text-deep">Semua beres</p>
				<p class="text-sm font-medium text-ink/70">tidak ada yang menunggu</p>
			{/if}
		</div>
	</div>
</div>
