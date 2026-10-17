<script lang="ts">
	import AccountCard from '$lib/components/dashboard/AccountCard.svelte';
	import ActionList from '$lib/components/dashboard/ActionList.svelte';
	import BankCard from '$lib/components/dashboard/BankCard.svelte';
	import RecentTransactions from '$lib/components/dashboard/RecentTransactions.svelte';
	import ReviewCard from '$lib/components/dashboard/ReviewCard.svelte';
	import StatBars from '$lib/components/dashboard/StatBars.svelte';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();
	const d = $derived(data.dash);
	const role = $derived(data.ctx.role);
	const companyName = $derived(data.ctx.companies.find((c) => c.id === data.ctx.companyId)?.name ?? '');
	const months = $derived(d.monthly.map((m) => m.month));
	const current = $derived(d.monthly.at(-1)!);
	const fyYear = $derived(current.month.slice(0, 4));
</script>

<svelte:head><title>Dashboard · Jurnalku</title></svelte:head>

<div class="mb-6">
	<h1 class="text-2xl font-bold tracking-tight text-ink">Dashboard</h1>
	<p class="mt-1 text-sm text-muted-foreground">Ringkasan pembukuan {companyName}</p>
</div>

<div class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
	<BankCard bank={d.bank} canSetBank={roleAtLeast(role, 'admin')} />
	<ReviewCard pendingCount={d.pendingCount} canReview={roleAtLeast(role, 'accountant')} />
	<AccountCard upload={d.latestUpload} {companyName} canUpload={roleAtLeast(role, 'accountant')} />
</div>

<div class="mt-8 grid grid-cols-1 gap-6 border-y border-border py-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-10">
	<StatBars
		label="Pemasukan"
		value={current.income}
		valueClass="text-green"
		caption="Arus bank masuk bulan ini"
		values={d.monthly.map((m) => m.income)}
		{months}
		barColor="var(--green)"
	/>
	<StatBars
		label="Pengeluaran"
		value={current.expense}
		valueClass="text-deep"
		caption="Arus bank keluar bulan ini"
		values={d.monthly.map((m) => m.expense)}
		{months}
		barColor="var(--deep)"
	/>
	<StatBars
		label="Laba Tahun Berjalan"
		value={d.profitThisYear}
		valueClass={d.profitThisYear.startsWith('-') ? 'text-destructive' : 'text-green'}
		caption="Tahun buku {fyYear}"
		tag={d.balanced ? 'Balance ✓' : 'Tidak balance'}
		tagClass={d.balanced ? 'bg-lime text-on-lime' : 'bg-destructive/10 text-destructive'}
		values={d.monthly.map((m) => (Number(m.income) - Number(m.expense)).toFixed(2))}
		{months}
		barColor="var(--lime-2)"
	/>
</div>

<div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
	<RecentTransactions rows={d.recentTransactions} />
	<ActionList actions={d.actions} />
</div>
