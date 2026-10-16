<script lang="ts">
	import ArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { formatIdr } from '$lib/money';
	import type { DashboardView } from '$lib/server/reports/dashboard';

	let { rows }: { rows: DashboardView['recentTransactions'] } = $props();

	const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
	const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
	const dayLabel = (iso: string) => {
		const d = new Date(`${iso}T00:00:00Z`);
		return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
	};
	const groups = $derived(
		rows.reduce<Array<{ date: string; items: typeof rows }>>((acc, r) => {
			const last = acc.at(-1);
			if (last?.date === r.txnDate) last.items.push(r);
			else acc.push({ date: r.txnDate, items: [r] });
			return acc;
		}, [])
	);
</script>

<section class="rounded-[20px] bg-[#fbfcfb] p-5">
	<div class="mb-2 flex items-center justify-between">
		<h2 class="text-base font-bold">Transaksi Terbaru</h2>
		<a href="/uploads" class="text-xs font-medium text-muted-foreground hover:text-deep">Riwayat upload →</a>
	</div>
	{#if rows.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">Belum ada transaksi. Transaksi dari eStatement akan muncul di sini.</p>
	{:else}
		{#each groups as g (g.date)}
			<p class="mt-3 mb-1 text-xs font-medium text-muted-foreground">{dayLabel(g.date)}</p>
			{#each g.items as t (t.id)}
				{@const incoming = !t.amount.startsWith('-')}
				<div class="flex items-center gap-3 py-2">
					<span class="flex size-9 shrink-0 items-center justify-center rounded-xl {incoming ? 'bg-pale text-green' : 'bg-muted text-ink/60'}">
						{#if incoming}<ArrowDownLeft class="size-4" />{:else}<ArrowUpRight class="size-4" />{/if}
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium" title={t.description}>{t.description}</p>
						<p class="truncate text-xs text-muted-foreground">{t.accountName ?? 'Belum dikategorikan'}</p>
					</div>
					<p class="shrink-0 text-sm font-semibold tabular-nums {incoming ? 'text-green' : 'text-destructive'}">
						{incoming ? '+' : '−'}Rp {formatIdr(t.amount.replace('-', ''))}
					</p>
				</div>
			{/each}
		{/each}
	{/if}
</section>
