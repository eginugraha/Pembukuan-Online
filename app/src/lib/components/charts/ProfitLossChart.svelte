<script lang="ts">
	import { barGeometry, monthFull as full, monthHref as href, monthLabel, negExtent, niceMax } from '$lib/charts';
	import { formatIdr, formatIdrShort } from '$lib/money';

	type Row = { month: string; revenue: string; expense: string; netProfit: string; future: boolean };
	let { rows }: { rows: Row[] } = $props();

	let width = $state(360);
	const W = $derived(Math.max(width, 300));
	const H = 260;
	const left = 52;
	const top = 14;
	const bottom = 30;
	const plotW = $derived(W - left - 8);
	const plotH = H - top - bottom;

	const nums = $derived(
		rows.map((r) => ({ rev: Number(r.revenue), exp: Number(r.expense), net: Number(r.netProfit) }))
	);
	const empty = $derived(nums.every((n) => n.rev === 0 && n.exp === 0 && n.net === 0));
	const max = $derived(niceMax(nums.flatMap((n) => [n.rev, n.exp, n.net]).filter((v) => v > 0)));
	const negMax = $derived(negExtent(nums.map((n) => n.rev), nums.map((n) => n.exp), nums.map((n) => n.net)));
	const revG = $derived(barGeometry(nums.map((n) => n.rev), plotH, max, negMax));
	const expG = $derived(barGeometry(nums.map((n) => n.exp), plotH, max, negMax));
	const scale = $derived(plotH / (max + negMax));
	const zeroY = $derived(top + max * scale);
	const slot = $derived(plotW / Math.max(rows.length, 1));
	const barW = $derived(Math.min(slot * 0.32, 22));
	const cx = (i: number) => left + slot * i + slot / 2;
	const netY = (i: number) => zeroY - nums[i].net * scale;
	const netLine = $derived(
		rows
			.map((r, i) => ({ r, i }))
			.filter(({ r }) => !r.future)
			.map(({ i }, k) => `${k === 0 ? 'M' : 'L'} ${cx(i)} ${netY(i)}`)
			.join(' ')
	);
	const ticks = $derived(
		[0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: max * f, y: zeroY - max * f * scale }))
	);
	const crossYear = $derived(rows.length > 0 && rows[0].month.slice(0, 4) !== rows[rows.length - 1].month.slice(0, 4));

	const narrow = $derived(slot < 44);
	const label = (month: string) => monthLabel(month, crossYear);
	const showLabel = (i: number) => !narrow || i % 2 === 0;
	const aria = (r: Row) =>
		`${full(r.month)}: pendapatan Rp${formatIdr(r.revenue)}, beban Rp${formatIdr(r.expense)}, laba Rp${formatIdr(r.netProfit)}`;

	let active = $state<number | null>(null);
	const tipW = 190;
	const tipX = $derived(active === null ? 0 : Math.min(Math.max(cx(active) - tipW / 2, left), W - tipW - 4));
</script>

{#if empty}
	<p class="py-12 text-center text-sm text-muted-foreground">Belum ada jurnal di tahun buku ini</p>
{:else}
	<div class="relative" bind:clientWidth={width}>
		<svg
			viewBox="0 0 {W} {H}"
			width="100%"
			role="group"
			aria-label="Grafik Laba Rugi per bulan: pendapatan, beban dan laba bersih"
			class="block h-auto w-full"
		>
			{#each ticks as t (t.v)}
				<line x1={left} x2={W - 8} y1={t.y} y2={t.y} stroke="var(--border)" stroke-width="1" />
				<text x={left - 6} y={t.y + 3} text-anchor="end" font-size="11" fill="var(--muted-foreground)">{formatIdrShort(t.v)}</text>
			{/each}
			{#if negMax > 0}
				<line x1={left} x2={W - 8} y1={zeroY} y2={zeroY} stroke="var(--muted-foreground)" stroke-width="1" />
			{/if}

			{#each rows as r, i (r.month)}
				{#snippet group()}
					<rect x={left + slot * i} y={top} width={slot} height={plotH} fill="transparent" />
					{#if active === i}
						<rect x={left + slot * i} y={top} width={slot} height={plotH} fill="var(--muted)" opacity="0.5" stroke="var(--ring)" stroke-width="2" rx="4" />
					{/if}
					{#if !r.future}
						<rect x={cx(i) - barW - 1} y={top + revG[i].y} width={barW} height={revG[i].h} rx="2" fill="var(--green)" />
						<rect x={cx(i) + 1} y={top + expG[i].y} width={barW} height={expG[i].h} rx="2" fill="var(--destructive)" opacity="0.7" />
					{/if}
					{#if showLabel(i)}<text x={cx(i)} y={H - 10} text-anchor="middle" font-size="11" fill="var(--muted-foreground)">{label(r.month)}</text>{/if}
				{/snippet}
				{#if r.future}
					<g role="presentation">{@render group()}</g>
				{:else}
					<a
						href={href(r.month)}
						aria-label={aria(r)}
						class="outline-none"
						onmouseenter={() => (active = i)}
						onmouseleave={() => (active = null)}
						onfocus={() => (active = i)}
						onblur={() => (active = null)}
					>
						{@render group()}
					</a>
				{/if}
			{/each}

			<path d={netLine} fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" pointer-events="none" />
			{#each rows as r, i (r.month)}
				{#if !r.future}
					<circle cx={cx(i)} cy={netY(i)} r="3" fill="var(--card)" stroke="var(--ink)" stroke-width="1.5" pointer-events="none" />
				{/if}
			{/each}

			{#if active !== null}
				{@const r = rows[active]}
				<g transform="translate({tipX}, {top})" pointer-events="none">
					<rect width={tipW} height="66" rx="6" fill="var(--popover)" stroke="var(--border)" />
					<text x="8" y="16" font-size="11" font-weight="600" fill="var(--ink)">{full(r.month)}</text>
					<text x="8" y="31" font-size="11" fill="var(--green)">Pendapatan {formatIdrShort(r.revenue)}</text>
					<text x="8" y="44" font-size="11" fill="var(--destructive)">Beban {formatIdrShort(r.expense)}</text>
					<text x="8" y="60" font-size="11" fill={Number(r.netProfit) < 0 ? 'var(--destructive)' : 'var(--ink)'}>Laba {Number(r.netProfit) < 0 ? `(${formatIdrShort(r.netProfit.replace('-', ''))})` : formatIdrShort(r.netProfit)}</text>
				</g>
			{/if}
		</svg>

		<div class="sr-only">
			<table>
			<caption>Laba Rugi per bulan</caption>
			<thead><tr><th>Bulan</th><th>Pendapatan</th><th>Beban</th><th>Laba bersih</th></tr></thead>
			<tbody>
				{#each rows as r (r.month)}
					<tr><td>{full(r.month)}</td><td>{formatIdr(r.revenue)}</td><td>{formatIdr(r.expense)}</td><td>{formatIdr(r.netProfit)}</td></tr>
				{/each}
			</tbody>
		</table>
		</div>
	</div>

	<ul class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
		<li class="flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm" style="background: var(--green)"></span>Pendapatan</li>
		<li class="flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm" style="background: var(--destructive); opacity: 0.7"></span>Beban</li>
		<li class="flex items-center gap-1.5"><span class="inline-block h-0.5 w-3" style="background: var(--ink)"></span>Laba bersih</li>
	</ul>
{/if}
