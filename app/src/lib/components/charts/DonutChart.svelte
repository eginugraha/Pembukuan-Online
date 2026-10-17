<script lang="ts">
	import { donutArcs } from '$lib/charts';
	import { formatIdr, formatIdrShort } from '$lib/money';

	type Slice = { accountId: string | null; name: string; amount: string; percent: number };
	let { slices, total, kind }: { slices: Slice[]; total: string; kind: 'expense' | 'revenue' } = $props();

	const noun = $derived(kind === 'expense' ? 'beban' : 'pendapatan');
	const arcs = $derived(donutArcs(slices.map((s) => Number(s.amount)), 80, 52));
	const fill = (s: Slice, i: number) => (s.accountId === null ? 'var(--muted-foreground)' : `var(--chart-${(i % 5) + 1})`);
	const opacity = (s: Slice) => (s.accountId === null ? 0.4 : 1);
</script>

{#if slices.length === 0}
	<p class="py-12 text-center text-sm text-muted-foreground">Belum ada {noun} di tahun buku ini</p>
{:else}
	<div class="flex flex-col items-center gap-5 sm:flex-row">
		<svg viewBox="-90 -90 180 180" class="size-44 shrink-0" role="img" aria-label="Komposisi {noun}: total Rp{formatIdr(total)}">
			{#each arcs as d, i (i)}
				<path {d} fill={fill(slices[i], i)} fill-opacity={opacity(slices[i])} fill-rule="evenodd" stroke="var(--card)" stroke-width="1.5" />
			{/each}
			<text y="-2" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink)">{formatIdrShort(total)}</text>
			<text y="14" text-anchor="middle" font-size="9" fill="var(--muted-foreground)">Total {noun}</text>
		</svg>
		<ul class="min-w-0 flex-1 space-y-1.5 self-stretch text-sm">
			{#each slices as s, i (s.accountId ?? 'lainnya')}
				<li class="flex items-center gap-2">
					<span class="inline-block size-2.5 shrink-0 rounded-sm" style="background: {fill(s, i)}; opacity: {opacity(s)}"></span>
					<span class="min-w-0 flex-1 truncate">{s.name}</span>
					<span class="tabular-nums text-muted-foreground">{formatIdr(s.amount)}</span>
					<span class="w-12 text-right tabular-nums">{s.percent}%</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}
