<script lang="ts">
	import AccountCard from '$lib/components/dashboard/AccountCard.svelte';
	import ActionList from '$lib/components/dashboard/ActionList.svelte';
	import BankCard from '$lib/components/dashboard/BankCard.svelte';
	import RecentTransactions from '$lib/components/dashboard/RecentTransactions.svelte';
	import ReviewCard from '$lib/components/dashboard/ReviewCard.svelte';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();
	const d = $derived(data.dash);
	const role = $derived(data.ctx.role);
	const companyName = $derived(data.ctx.companies.find((c) => c.id === data.ctx.companyId)?.name ?? '');
</script>

<svelte:head><title>Dashboard · pena</title></svelte:head>

<div class="mb-6">
	<h1 class="text-2xl font-bold tracking-tight text-ink">Dashboard</h1>
	<p class="mt-1 text-sm text-muted-foreground">Ringkasan pembukuan {companyName}</p>
</div>

<div class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
	<BankCard bank={d.bank} canSetBank={roleAtLeast(role, 'admin')} />
	<ReviewCard pendingCount={d.pendingCount} canReview={roleAtLeast(role, 'accountant')} />
	<AccountCard upload={d.latestUpload} {companyName} canUpload={roleAtLeast(role, 'accountant')} />
</div>

<div class="mt-8 flex items-baseline gap-3 border-y border-border py-6">
	<span class="text-sm text-muted-foreground">Laba Tahun Berjalan</span>
	<span class="text-2xl font-bold {d.profitThisYear.startsWith('-') ? 'text-destructive' : 'text-green'}">{d.profitThisYear}</span>
	<span class="rounded-full px-2 py-0.5 text-xs {d.balanced ? 'bg-lime text-on-lime' : 'bg-destructive/10 text-destructive'}">
		{d.balanced ? 'Balance ✓' : 'Tidak balance'}
	</span>
</div>

<div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
	<RecentTransactions rows={d.recentTransactions} />
	<ActionList actions={d.actions} />
</div>
