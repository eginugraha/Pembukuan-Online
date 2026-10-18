<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDateLong } from '$lib/periods';
	import { formatAccounting as amount } from '$lib/money';
	import type { BalanceSheetLine, BalanceSheetSection } from '$lib/server/reports/balance-sheet';
	import DateField from '$lib/components/DateField.svelte';
	import FilterActions from '$lib/components/FilterActions.svelte';

	let { data } = $props();
	const cur = $derived(data.current);
	const pdfHref = $derived(`/api/reports/balance-sheet/export?as_of=${cur.asOf}`);
	const cmp = $derived(data.comparative);
	const active = $derived(cur.asOf !== data.defaultAsOf);
	const balanced = $derived(cur.balanced && cmp.balanced);
	const badDates = $derived([...(cur.balanced ? [] : [cur.asOf]), ...(cmp.balanced ? [] : [cmp.asOf])].map(formatDateLong).join(' dan '));

	const keyOf = (l: BalanceSheetLine) => l.accountId ?? l.name;
	const indent = (depth: number) => `padding-left: ${1 + depth * 1.25}rem`;
</script>

{#snippet line(l: BalanceSheetLine, p: BalanceSheetLine | undefined, depth: number)}
	{#if l.children.length === 0}
		<Table.Row>
			<Table.Cell class="whitespace-normal" style={indent(depth)}>{l.name}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{amount(l.amount)}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{amount(p?.amount ?? '0.00')}</Table.Cell>
		</Table.Row>
	{:else}
		<Table.Row>
			<Table.Cell class="whitespace-normal" style={indent(depth)} colspan={3}>{l.name}</Table.Cell>
		</Table.Row>
		{#each l.children as c (keyOf(c))}{@render line(c, p?.children.find((x) => keyOf(x) === keyOf(c)), depth + 1)}{/each}
		<Table.Row class="text-ink/70">
			<Table.Cell class="whitespace-normal" style={indent(depth)}>Jumlah {l.name}</Table.Cell>
			<Table.Cell class="border-t text-right tabular-nums">{amount(l.amount)}</Table.Cell>
			<Table.Cell class="border-t text-right tabular-nums">{amount(p?.amount ?? '0.00')}</Table.Cell>
		</Table.Row>
	{/if}
{/snippet}

{#snippet section(s: BalanceSheetSection, p: BalanceSheetSection | undefined)}
	<Table.Row class="bg-pale/60">
		<Table.Cell colspan={3} class="font-semibold text-deep">{s.title}</Table.Cell>
	</Table.Row>
	{#each s.lines as l (keyOf(l))}{@render line(l, p?.lines.find((x) => keyOf(x) === keyOf(l)), 1)}{/each}
	{#if s.lines.length === 0}
		<Table.Row><Table.Cell colspan={3} class="pl-8 text-muted-foreground/70">—</Table.Cell></Table.Row>
	{/if}
	<Table.Row class="font-medium">
		<Table.Cell class="whitespace-normal">Jumlah {s.title}</Table.Cell>
		<Table.Cell class="border-t text-right tabular-nums">{amount(s.total)}</Table.Cell>
		<Table.Cell class="border-t text-right tabular-nums">{amount(p?.total ?? '0.00')}</Table.Cell>
	</Table.Row>
{/snippet}

{#snippet grandTotal(label: string, value: string, prev: string)}
	<Table.Row class="total-row">
		<Table.Cell class="whitespace-normal">{label}</Table.Cell>
		<Table.Cell class="text-right tabular-nums">{amount(value)}</Table.Cell>
		<Table.Cell class="text-right tabular-nums">{amount(prev)}</Table.Cell>
	</Table.Row>
{/snippet}

<PageHeader title="Laporan Posisi Keuangan" description="{data.companyName} · Per {formatDateLong(cur.asOf)} dan {formatDateLong(cmp.asOf)}">
	{#snippet actions()}
		<Badge variant={balanced ? 'success' : 'destructive'}>{balanced ? 'Balance' : 'Tidak balance'}</Badge>
		<Button href={pdfHref}>Unduh PDF</Button>
	{/snippet}
</PageHeader>

<form method="GET" class="panel mb-5 flex flex-wrap items-end gap-3 p-4">
	<div><span class="text-xs font-semibold text-ink/70">Per tanggal</span><DateField name="as_of" value={cur.asOf} aria-label="Per tanggal" class="mt-1" /></div>
	<FilterActions active={active} />
</form>

<div class="max-w-4xl">
	<div class="panel overflow-x-auto px-2 py-1">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Keterangan</Table.Head>
				<Table.Head class="text-right">{formatDateLong(cur.asOf)}</Table.Head>
				<Table.Head class="text-right">{formatDateLong(cmp.asOf)}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			<Table.Row><Table.Cell colspan={3} class="pt-4 text-base font-bold tracking-wide text-ink">ASET</Table.Cell></Table.Row>
			{@render section(cur.assets.current, cmp.assets.current)}
			{@render section(cur.assets.nonCurrent, cmp.assets.nonCurrent)}
			{@render grandTotal('JUMLAH ASET', cur.assets.total, cmp.assets.total)}

			<Table.Row><Table.Cell colspan={3} class="pt-6 text-base font-bold tracking-wide text-ink">LIABILITAS DAN EKUITAS</Table.Cell></Table.Row>
			{@render section(cur.liabilities.current, cmp.liabilities.current)}
			{@render section(cur.liabilities.nonCurrent, cmp.liabilities.nonCurrent)}
			<Table.Row class="font-medium">
				<Table.Cell>Jumlah Liabilitas</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{amount(cur.liabilities.total)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{amount(cmp.liabilities.total)}</Table.Cell>
			</Table.Row>
			{@render section(cur.equity, cmp.equity)}
			{@render grandTotal('JUMLAH LIABILITAS DAN EKUITAS', cur.totalLiabilitiesAndEquity, cmp.totalLiabilitiesAndEquity)}
		</Table.Body>
	</Table.Root>
	</div>
	{#if !balanced}
		<p class="mt-3 px-3 pb-3 text-sm text-destructive">Jumlah aset tidak sama dengan jumlah liabilitas dan ekuitas per {badDates}. Periksa saldo awal dan jurnal.</p>
	{/if}
</div>
