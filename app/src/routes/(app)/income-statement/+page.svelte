<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PeriodFilter from '$lib/components/PeriodFilter.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatAccounting } from '$lib/money';
	import { formatPeriod } from '$lib/periods';
	import type { IncomeSection } from '$lib/server/reports/income-statement';

	let { data } = $props();
	const cur = $derived(data.current);
	const cmp = $derived(data.comparative);
	const pdfHref = $derived(`/api/reports/income-statement/export?from=${cur.from}&to=${cur.to}`);
</script>

{#snippet section(s: IncomeSection, p: IncomeSection | undefined)}
	<Table.Row class="bg-pale/60">
		<Table.Cell colspan={3} class="font-semibold text-deep">{s.title}</Table.Cell>
	</Table.Row>
	{#each s.lines as l (l.accountId)}
		<Table.Row>
			<Table.Cell class="whitespace-normal pl-8">{l.code} {l.name}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatAccounting(l.amount)}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatAccounting(p?.lines.find((x) => x.accountId === l.accountId)?.amount ?? '0.00')}</Table.Cell>
		</Table.Row>
	{/each}
	{#if s.lines.length === 0}
		<Table.Row><Table.Cell colspan={3} class="pl-8 text-muted-foreground/70">—</Table.Cell></Table.Row>
	{/if}
	<Table.Row class="font-medium">
		<Table.Cell class="whitespace-normal">Jumlah {s.title}</Table.Cell>
		<Table.Cell class="border-t text-right tabular-nums">{formatAccounting(s.total)}</Table.Cell>
		<Table.Cell class="border-t text-right tabular-nums">{formatAccounting(p?.total ?? '0.00')}</Table.Cell>
	</Table.Row>
{/snippet}

{#snippet subtotal(label: string, value: string, prev: string)}
	<Table.Row class="font-semibold">
		<Table.Cell class="whitespace-normal">{label}</Table.Cell>
		<Table.Cell class="text-right tabular-nums">{formatAccounting(value)}</Table.Cell>
		<Table.Cell class="text-right tabular-nums">{formatAccounting(prev)}</Table.Cell>
	</Table.Row>
{/snippet}

<PageHeader title="Laba Rugi" description="{data.companyName} · {formatPeriod(cur.from, cur.to)}">
	{#snippet actions()}
		<Button href={pdfHref}>Unduh PDF</Button>
	{/snippet}
</PageHeader>

<PeriodFilter from={cur.from} to={cur.to} defaults={data.defaults} rangeError={data.rangeError} />

<div class="max-w-4xl">
	<div class="panel overflow-x-auto px-2 py-1">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Keterangan</Table.Head>
					<Table.Head class="text-right">{formatPeriod(cur.from, cur.to)}</Table.Head>
					<Table.Head class="text-right">{formatPeriod(cmp.from, cmp.to)}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each cur.sections as s (s.key)}
					{@render section(s, cmp.sections.find((x) => x.key === s.key))}
					{#if s.key === 'cogs'}
						{@render subtotal('Laba Kotor', cur.grossProfit, cmp.grossProfit)}
					{:else if s.key === 'opex'}
						{@render subtotal('Laba Usaha', cur.operatingProfit, cmp.operatingProfit)}
					{:else if s.key === 'otherExpense'}
						{@render subtotal('Laba Sebelum Pajak', cur.profitBeforeTax, cmp.profitBeforeTax)}
					{/if}
				{/each}
				<Table.Row class="total-row">
					<Table.Cell class="whitespace-normal">Laba Bersih</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatAccounting(cur.netProfit)}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatAccounting(cmp.netProfit)}</Table.Cell>
				</Table.Row>
			</Table.Body>
		</Table.Root>
	</div>
</div>
