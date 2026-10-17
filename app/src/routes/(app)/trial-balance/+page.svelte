<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PeriodFilter from '$lib/components/PeriodFilter.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatIdr } from '$lib/money';
	import { formatPeriod } from '$lib/periods';

	let { data } = $props();
	const tb = $derived(data.tb);
	const cell = (v: string) => (v !== '0.00' ? formatIdr(v) : '');
</script>

<PageHeader title="Neraca Saldo" description="{data.companyName} · {formatPeriod(tb.from, tb.to)}">
	{#snippet actions()}
		<Badge variant={tb.balanced ? 'success' : 'destructive'}>{tb.balanced ? 'Balance' : 'Tidak balance'}</Badge>
	{/snippet}
</PageHeader>

<PeriodFilter from={tb.from} to={tb.to} defaults={data.defaults} />

	<div class="panel overflow-x-auto px-2 py-1">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head rowspan={2}>Kode</Table.Head>
					<Table.Head rowspan={2}>Akun</Table.Head>
					<Table.Head colspan={2} class="text-center">Saldo Awal</Table.Head>
					<Table.Head colspan={2} class="text-center">Mutasi</Table.Head>
					<Table.Head colspan={2} class="text-center">Saldo Akhir</Table.Head>
				</Table.Row>
				<Table.Row>
					{#each [0, 1, 2] as i (i)}
						<Table.Head class="text-right">Debit</Table.Head>
						<Table.Head class="text-right">Kredit</Table.Head>
					{/each}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if tb.rows.length === 0}
					<Table.Row>
						<Table.Cell colspan={8} class="p-8 text-center text-muted-foreground">Belum ada saldo pada periode ini.</Table.Cell>
					</Table.Row>
				{/if}
				{#each tb.rows as r (r.accountId)}
					<Table.Row>
						<Table.Cell>{r.code}</Table.Cell>
						<Table.Cell>{r.name}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{cell(r.openingDebit)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{cell(r.openingCredit)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{cell(r.debit)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{cell(r.credit)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{cell(r.closingDebit)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{cell(r.closingCredit)}</Table.Cell>
					</Table.Row>
				{/each}
				{#if tb.rows.length > 0}
				<Table.Row class="total-row">
					<Table.Cell colspan={2}>Total</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatIdr(tb.totals.openingDebit)}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatIdr(tb.totals.openingCredit)}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatIdr(tb.totals.debit)}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatIdr(tb.totals.credit)}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatIdr(tb.totals.closingDebit)}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatIdr(tb.totals.closingCredit)}</Table.Cell>
				</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</div>
