<script lang="ts">
	import { formatIdr } from '$lib/money';
	import type { DashboardView } from '$lib/server/reports/dashboard';

	let { bank, canSetBank }: { bank: DashboardView['bank']; canSetBank: boolean } = $props();
</script>

<div class="relative flex min-h-40 flex-col justify-between overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#f3ffe9_0%,#dff8c8_55%,#c9efb0_100%)] p-5 shadow-[0_22px_34px_-22px_var(--green)]">
	<div class="flex items-start justify-between gap-3">
		<p class="text-xs font-semibold text-ink/80">Saldo {bank?.name ?? 'Bank'}</p>
		{#if bank}
			<a href="/ledger?account_id={bank.accountId}" class="text-[11px] font-medium text-deep underline underline-offset-2 opacity-75 hover:opacity-100">Buku Besar</a>
		{/if}
	</div>
	{#if bank}
		<p class="truncate text-[26px] leading-tight font-extrabold tracking-tight text-ink tabular-nums" title="Rp {formatIdr(bank.balance)}">
			Rp {formatIdr(bank.balance).replace(/,00$/, '')}<span class="ml-1.5 text-xs font-semibold text-ink/60">IDR</span>
		</p>
	{:else}
		<div>
			<p class="text-sm text-ink/70">Akun bank perusahaan belum diatur.</p>
			{#if canSetBank}
				<a href="/settings/company" class="mt-2 inline-block text-sm font-semibold text-deep hover:underline">Atur akun bank →</a>
			{/if}
		</div>
	{/if}
</div>
