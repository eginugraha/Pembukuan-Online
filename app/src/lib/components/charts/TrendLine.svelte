<script lang="ts">
	import { linePath, linePoints, monthLabel } from '$lib/charts';
	import { formatIdr } from '$lib/money';

	let { points }: { points: Array<{ month: string; balance: string }> } = $props();

	const label = (m: string) => monthLabel(m, true);

	const W = 300;
	const H = 90;
	const values = $derived(points.map((p) => Number(p.balance)));
	const line = $derived(linePath(values, W, H - 8));
	const pts = $derived(linePoints(values, W, H - 8));
	const area = $derived(pts.length > 1 ? `${line} L ${W} ${H} L 0 ${H} Z` : '');
	const last = $derived(points[points.length - 1]);
</script>

{#if points.length > 0}
	<p class="text-2xl font-bold tabular-nums text-ink">Rp {formatIdr(last.balance)}</p>
	<svg
		viewBox="0 0 {W} {H}"
		width="100%"
		preserveAspectRatio="none"
		class="mt-3 block h-24 w-full overflow-visible"
		role="img"
		aria-label="Tren saldo bank {label(points[0].month)} sampai {label(last.month)}, saldo terakhir Rp{formatIdr(last.balance)}"
	>
		{#if pts.length === 1}<path d="M {pts[0].x} {pts[0].y} L {pts[0].x} {pts[0].y}" stroke="var(--green)" stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke" />{/if}
		{#if area}<path d={area} fill="var(--green)" opacity="0.12" />{/if}
		<path d={line} fill="none" stroke="var(--green)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
	</svg>
	<div class="mt-1 flex justify-between text-xs text-muted-foreground">
		<span>{label(points[0].month)}</span>
		<span>{label(last.month)}</span>
	</div>
{/if}
