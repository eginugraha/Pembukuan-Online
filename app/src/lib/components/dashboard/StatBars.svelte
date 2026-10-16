<script lang="ts">
	import { formatIdr, formatIdrShort } from '$lib/money';

	let {
		label,
		value,
		valueClass,
		caption,
		tag,
		tagClass,
		values,
		months,
		barColor
	}: {
		label: string;
		value: string;
		valueClass: string;
		caption: string;
		tag?: string;
		tagClass?: string;
		values: string[];
		months: string[];
		barColor: string;
	} = $props();

	const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
	const monthLabel = (ym: string) => `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
	const max = $derived(Math.max(...values.map((v) => Math.abs(Number(v))), 1));
	const pct = (v: string) => (Number(v) === 0 ? 6 : Math.max(14, Math.round((Math.abs(Number(v)) / max) * 100)));
</script>

<div class="flex items-end justify-between gap-4">
	<div class="min-w-0">
		<p class="text-xs font-semibold text-ink/70">{label}</p>
		<p class="mt-1.5 flex flex-wrap items-center gap-2 text-xl font-bold tabular-nums {valueClass}" title="Rp {formatIdr(value)}">
			{formatIdrShort(value)}
			{#if tag}<span class="rounded-full px-2 py-0.5 text-[10px] font-semibold {tagClass}">{tag}</span>{/if}
		</p>
		<p class="mt-0.5 text-xs text-muted-foreground">{caption}</p>
	</div>
	<div class="flex h-16 shrink-0 items-end gap-1.5" role="img" aria-label="{label} 6 bulan terakhir">
		{#each values as v, i (i)}
			{@const last = i === values.length - 1}
			<span
				class="w-2.5 rounded-[4px] {last ? (Number(v) !== 0 ? 'glow' : '') : 'bg-muted'}"
				style="height: {pct(v)}%; {last ? `background: ${barColor}` : ''}"
				title="{monthLabel(months[i])}: Rp {formatIdr(v)}"
			></span>
		{/each}
	</div>
</div>
