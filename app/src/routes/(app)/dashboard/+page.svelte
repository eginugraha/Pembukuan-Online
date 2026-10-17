<script lang="ts">
	import AccountCard from '$lib/components/dashboard/AccountCard.svelte';
	import ActionList from '$lib/components/dashboard/ActionList.svelte';
	import BankCard from '$lib/components/dashboard/BankCard.svelte';
	import RecentTransactions from '$lib/components/dashboard/RecentTransactions.svelte';
	import ReviewCard from '$lib/components/dashboard/ReviewCard.svelte';
	import ProfitLossChart from '$lib/components/charts/ProfitLossChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import TrendLine from '$lib/components/charts/TrendLine.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { formatAccounting } from '$lib/money';
	import { fiscalYearEnd, formatPeriod } from '$lib/periods';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();
	const d = $derived(data.dash);
	const role = $derived(data.ctx.role);
	let kind = $state<'expense' | 'revenue'>('expense');
	const comp = $derived(d.composition[kind]);
	const companyName = $derived(data.ctx.companies.find((c) => c.id === data.ctx.companyId)?.name ?? '');
</script>

<PageHeader title="Dashboard" description="Ringkasan pembukuan {companyName}" />

<div class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
	<BankCard bank={d.bank} canSetBank={roleAtLeast(role, 'admin')} />
	<ReviewCard pendingCount={d.pendingCount} canReview={roleAtLeast(role, 'accountant')} />
	<AccountCard upload={d.latestUpload} {companyName} canUpload={roleAtLeast(role, 'accountant')} />
</div>

<section class="mt-6 rounded-[20px] bg-surface-soft p-5">
	<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-base font-semibold text-ink">Laba Rugi</h2>
			<p class="text-sm text-muted-foreground">Tahun buku {formatPeriod(d.fiscalYearStart, fiscalYearEnd(d.fiscalYearStart))}</p>
		</div>
		<div class="flex flex-wrap items-center gap-2 sm:text-right">
			<span class="text-sm text-muted-foreground">Laba Tahun Berjalan</span>
			<span class="text-2xl font-bold {d.profitThisYear.startsWith('-') ? 'text-destructive' : 'text-green'}">Rp {formatAccounting(d.profitThisYear)}</span>
			<span class="rounded-full px-2 py-0.5 text-xs {d.balanced ? 'bg-lime text-on-lime' : 'bg-destructive/10 text-destructive'}">
				{d.balanced ? 'Balance ✓' : 'Tidak balance'}
			</span>
		</div>
	</div>
	<ProfitLossChart rows={d.profitLoss} />
</section>

<div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
	<section class="rounded-[20px] bg-surface-soft p-5">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-base font-semibold text-ink">Komposisi</h2>
			<div role="radiogroup" aria-label="Jenis komposisi" class="inline-flex rounded-lg border border-border p-0.5 text-sm">
				{#each [['expense', 'Beban'], ['revenue', 'Pendapatan']] as const as [value, text] (value)}
					<button
						type="button"
						role="radio"
						aria-checked={kind === value}
						class="rounded-md px-3 py-1 {kind === value ? 'bg-muted font-medium text-ink' : 'text-muted-foreground'}"
						onclick={() => (kind = value)}
					>
						{text}
					</button>
				{/each}
			</div>
		</div>
		<DonutChart slices={comp.slices} total={comp.total} {kind} />
	</section>
	{#if d.bankTrend}
		<section class="rounded-[20px] bg-surface-soft p-5">
			<h2 class="mb-1 text-base font-semibold text-ink">Tren saldo bank</h2>
			<p class="mb-3 text-sm text-muted-foreground">12 bulan terakhir</p>
			<TrendLine points={d.bankTrend} />
		</section>
	{/if}
</div>

<div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
	<RecentTransactions rows={d.recentTransactions} />
	<ActionList actions={d.actions} />
</div>
