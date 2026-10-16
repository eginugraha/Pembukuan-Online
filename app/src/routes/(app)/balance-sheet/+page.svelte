<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import type { BalanceSheetLine, BalanceSheetSection } from '$lib/server/reports/balance-sheet';
	import { inputClass } from '$lib/ui';

	let { data } = $props();
	const bs = $derived(data.bs);

	// Format laporan keuangan: angka negatif (mis. akumulasi penyusutan) dalam kurung.
	const amount = (v: string) => (v.startsWith('-') ? `(${formatIdr(v.slice(1))})` : formatIdr(v));
	const indent = (depth: number) => `padding-left: ${1 + depth * 1.25}rem`;
</script>

{#snippet line(l: BalanceSheetLine, depth: number)}
	{#if l.children.length === 0}
		<Table.Row>
			<Table.Cell style={indent(depth)}>{l.name}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{amount(l.amount)}</Table.Cell>
		</Table.Row>
	{:else}
		<Table.Row>
			<Table.Cell style={indent(depth)} colspan={2}>{l.name}</Table.Cell>
		</Table.Row>
		{#each l.children as c (c.accountId)}{@render line(c, depth + 1)}{/each}
		<Table.Row class="text-slate-600">
			<Table.Cell style={indent(depth)}>Jumlah {l.name}</Table.Cell>
			<Table.Cell class="border-t text-right tabular-nums">{amount(l.amount)}</Table.Cell>
		</Table.Row>
	{/if}
{/snippet}

{#snippet section(s: BalanceSheetSection)}
	<Table.Row class="bg-slate-50">
		<Table.Cell colspan={2} class="font-medium">{s.title}</Table.Cell>
	</Table.Row>
	{#each s.lines as l (l.accountId ?? l.name)}{@render line(l, 1)}{/each}
	{#if s.lines.length === 0}
		<Table.Row><Table.Cell colspan={2} class="pl-8 text-slate-400">—</Table.Cell></Table.Row>
	{/if}
	<Table.Row class="font-medium">
		<Table.Cell>Jumlah {s.title}</Table.Cell>
		<Table.Cell class="border-t text-right tabular-nums">{amount(s.total)}</Table.Cell>
	</Table.Row>
{/snippet}

{#snippet grandTotal(label: string, value: string)}
	<Table.Row class="border-t-2 font-semibold">
		<Table.Cell>{label}</Table.Cell>
		<Table.Cell class="text-right tabular-nums">{amount(value)}</Table.Cell>
	</Table.Row>
{/snippet}

<PageHeader title="Laporan Posisi Keuangan" description="Per {formatDate(bs.asOf)} · tahun buku mulai {formatDate(bs.fiscalYearStart)}">
	{#snippet actions()}
		<Badge variant={bs.balanced ? 'default' : 'destructive'}>{bs.balanced ? 'Balance' : 'Tidak balance'}</Badge>
	{/snippet}
</PageHeader>

<form method="GET" class="mb-4 flex items-end gap-3">
	<label class="text-sm">Per tanggal<input type="date" name="as_of" value={bs.asOf} class="{inputClass} mt-1" /></label>
	<Button type="submit" variant="outline">Tampilkan</Button>
</form>

<div class="max-w-3xl">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Keterangan</Table.Head>
				<Table.Head class="text-right">Rp</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			<Table.Row><Table.Cell colspan={2} class="pt-4 text-base font-semibold">ASET</Table.Cell></Table.Row>
			{@render section(bs.assets.current)}
			{@render section(bs.assets.nonCurrent)}
			{@render grandTotal('JUMLAH ASET', bs.assets.total)}

			<Table.Row><Table.Cell colspan={2} class="pt-6 text-base font-semibold">LIABILITAS DAN EKUITAS</Table.Cell></Table.Row>
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
	{#if !bs.balanced}
		<p class="mt-3 text-sm text-red-600">Jumlah aset tidak sama dengan jumlah liabilitas dan ekuitas. Periksa saldo awal dan jurnal.</p>
	{/if}
</div>
