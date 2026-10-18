<script lang="ts">
	import { untrack } from 'svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import PeriodFilter from '$lib/components/PeriodFilter.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatIdr } from '$lib/money';
	import { formatPeriod } from '$lib/periods';

	let { data } = $props();
	const tb = $derived(data.tb);
	const pdfHref = $derived(`/api/reports/trial-balance/export?from=${tb.from}&to=${tb.to}&closing=${data.closing ? '1' : ''}`);
	let closing = $state(untrack(() => data.closing ? '1' : ''));
	$effect(() => {
		closing = data.closing ? '1' : '';
	});
	const closingOptions = [
		{ value: '', label: 'Sebelum jurnal penutup' },
		{ value: '1', label: 'Setelah jurnal penutup' }
	];
	const cell = (v: string) => (v !== '0.00' ? formatIdr(v) : '');
</script>

<PageHeader title="Neraca Saldo" description="{data.companyName} · {formatPeriod(tb.from, tb.to)}">
	{#snippet actions()}
		<Badge variant={tb.balanced ? 'success' : 'destructive'}>{tb.balanced ? 'Balance' : 'Tidak balance'}</Badge>
		<Button href={pdfHref}>Unduh PDF</Button>
	{/snippet}
</PageHeader>

<PeriodFilter from={tb.from} to={tb.to} defaults={data.defaults} rangeError={data.rangeError} extraActive={data.closing}>
	{#snippet extra()}
		<div class="w-56">
			<span class="text-xs font-semibold text-ink/70">Jurnal penutup</span>
			<SimpleSelect name="closing" bind:value={closing} options={closingOptions} aria-label="Jurnal penutup" class="mt-1" />
		</div>
	{/snippet}
</PeriodFilter>

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
					<Table.Head class="text-right">Debit</Table.Head>
					<Table.Head class="text-right">Kredit</Table.Head>
					<Table.Head class="text-right">Debit</Table.Head>
					<Table.Head class="text-right">Kredit</Table.Head>
					<Table.Head class="text-right">Debit</Table.Head>
					<Table.Head class="text-right">Kredit</Table.Head>
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
