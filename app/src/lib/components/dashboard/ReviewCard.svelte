<script lang="ts">
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
		<!-- Objek 3D: kubus berlian di dalam lingkaran lembut -->
		<span class="flex size-14 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle,#eaffdb,#d2f5b6)]">
			<span class="size-7 rotate-45 rounded-lg bg-[linear-gradient(145deg,#9be06e,var(--deep))] shadow-[0_6px_8px_-4px_var(--deep),inset_3px_3px_4px_rgb(255_255_255/0.5),inset_-2px_-2px_4px_rgb(0_0_0/0.15)]"></span>
		</span>
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
