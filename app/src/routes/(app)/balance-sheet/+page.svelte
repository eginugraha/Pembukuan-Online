<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import type { BalanceSheetLine, BalanceSheetSection } from '$lib/server/reports/balance-sheet';
	import DateField from '$lib/components/DateField.svelte';
	import FilterActions from '$lib/components/FilterActions.svelte';

	let { data } = $props();
	const bs = $derived(data.bs);

	// Format laporan keuangan: angka negatif (mis. akumulasi penyusutan) dalam kurung.
	const amount = (v: string) => (v.startsWith('-') ? `(${formatIdr(v.slice(1))})` : formatIdr(v));
	const indent = (depth: number) => `padding-left: ${1 + depth * 1.25}rem`;
</script>

{#snippet line(l: BalanceSheetLine, depth: number)}
	{#if l.children.length === 0}
		<Table.Row>
			<Table.Cell class="whitespace-normal" style={indent(depth)}>{l.name}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{amount(l.amount)}</Table.Cell>
		</Table.Row>
	{:else}
		<Table.Row>
			<Table.Cell class="whitespace-normal" style={indent(depth)} colspan={2}>{l.name}</Table.Cell>
		</Table.Row>
		{#each l.children as c (c.accountId)}{@render line(c, depth + 1)}{/each}
		<Table.Row class="text-ink/70">
			<Table.Cell class="whitespace-normal" style={indent(depth)}>Jumlah {l.name}</Table.Cell>
			<Table.Cell class="border-t text-right tabular-nums">{amount(l.amount)}</Table.Cell>
		</Table.Row>
	{/if}
{/snippet}

{#snippet section(s: BalanceSheetSection)}
	<Table.Row class="bg-pale/60">
		<Table.Cell colspan={2} class="font-semibold text-deep">{s.title}</Table.Cell>
	</Table.Row>
	{#each s.lines as l (l.accountId ?? l.name)}{@render line(l, 1)}{/each}
	{#if s.lines.length === 0}
		<Table.Row><Table.Cell colspan={2} class="pl-8 text-muted-foreground/70">—</Table.Cell></Table.Row>
	{/if}
	<Table.Row class="font-medium">
		<Table.Cell class="whitespace-normal">Jumlah {s.title}</Table.Cell>
		<Table.Cell class="border-t text-right tabular-nums">{amount(s.total)}</Table.Cell>
	</Table.Row>
{/snippet}

{#snippet grandTotal(label: string, value: string)}
	<Table.Row class="border-t-2 border-border bg-pale font-bold text-deep hover:bg-pale">
		<Table.Cell class="whitespace-normal">{label}</Table.Cell>
		<Table.Cell class="text-right tabular-nums">{amount(value)}</Table.Cell>
	</Table.Row>
{/snippet}

<PageHeader title="Laporan Posisi Keuangan" description="Per {formatDate(bs.asOf)} · tahun buku mulai {formatDate(bs.fiscalYearStart)}">
	{#snippet actions()}
		<Badge variant={bs.balanced ? 'success' : 'destructive'}>{bs.balanced ? 'Balance' : 'Tidak balance'}</Badge>
	{/snippet}
</PageHeader>

<form method="GET" class="panel mb-5 flex flex-wrap items-end gap-3 p-4">
	<div><span class="text-xs font-semibold text-ink/70">Per tanggal</span><DateField name="as_of" value={bs.asOf} aria-label="Per tanggal" class="mt-1" /></div>
	<FilterActions />
</form>

<div class="max-w-3xl">
	<div class="panel px-2 py-1">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Keterangan</Table.Head>
				<Table.Head class="text-right">Rp</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			<Table.Row><Table.Cell colspan={2} class="pt-4 text-base font-bold tracking-wide text-ink">ASET</Table.Cell></Table.Row>
			{@render section(bs.assets.current)}
			{@render section(bs.assets.nonCurrent)}
			{@render grandTotal('JUMLAH ASET', bs.assets.total)}

			<Table.Row><Table.Cell colspan={2} class="pt-6 text-base font-bold tracking-wide text-ink">LIABILITAS DAN EKUITAS</Table.Cell></Table.Row>
			{@render section(bs.liabilities.current)}
			{@render section(bs.liabilities.nonCurrent)}
			<Table.Row class="font-medium">
				<Table.Cell>Jumlah Liabilitas</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{amount(bs.liabilities.total)}</Table.Cell>
			</Table.Row>
			{@render section(bs.equity)}
			{@render grandTotal('JUMLAH LIABILITAS DAN EKUITAS', bs.totalLiabilitiesAndEquity)}
		</Table.Body>
	</Table.Root>
	</div>
	{#if !bs.balanced}
		<p class="mt-3 px-3 pb-3 text-sm text-destructive">Jumlah aset tidak sama dengan jumlah liabilitas dan ekuitas. Periksa saldo awal dan jurnal.</p>
	{/if}
</div>
