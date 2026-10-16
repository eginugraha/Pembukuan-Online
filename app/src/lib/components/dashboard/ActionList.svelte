<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import FileCheck from '@lucide/svelte/icons/file-check';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import PartyPopper from '@lucide/svelte/icons/party-popper';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Wallet from '@lucide/svelte/icons/wallet';
	import type { Component } from 'svelte';
	import type { DashboardAction } from '$lib/server/reports/dashboard';

	let { actions }: { actions: DashboardAction[] } = $props();

	const STYLE: Record<DashboardAction['kind'], { icon: Component<{ class?: string }>; tile: string }> = {
		review: { icon: ListChecks, tile: 'tile-3d' },
		journal: { icon: FileCheck, tile: 'tile-3d tile-3d-deep' },
		opening: { icon: Wallet, tile: 'tile-3d tile-3d-lime' },
		balance_warning: { icon: TriangleAlert, tile: 'tile-3d tile-3d-amber' },
		error: { icon: CircleAlert, tile: 'tile-3d tile-3d-red' }
	};
</script>

<section class="p-1">
	<h2 class="mb-2 text-base font-bold">Perlu Tindakan</h2>
	{#if actions.length === 0}
		<div class="flex flex-col items-center py-8 text-center">
			<span class="tile-3d tile-3d-lime size-12 rounded-2xl"><PartyPopper class="size-6" /></span>
			<p class="mt-3 text-sm font-semibold">Tidak ada yang perlu ditindaklanjuti</p>
			<p class="text-xs text-muted-foreground">Pembukuan Anda sudah rapi.</p>
		</div>
	{:else}
		<ul>
			{#each actions as a, i (i)}
				{@const s = STYLE[a.kind]}
				<li>
					<a href={a.href} class="flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-pale/60">
						<span class="{s.tile} size-10 shrink-0"><s.icon class="size-[18px]" /></span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-semibold">{a.label}</span>
							<span class="block truncate text-xs text-muted-foreground">{a.detail}</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
