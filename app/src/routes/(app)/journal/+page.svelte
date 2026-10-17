<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import DateField from '$lib/components/DateField.svelte';
	import FilterActions from '$lib/components/FilterActions.svelte';

	let { data } = $props();
</script>

<PageHeader title="Jurnal Umum" />

<form method="GET" class="panel mb-5 flex flex-wrap items-end gap-3 p-4">
	<div><span class="text-xs font-semibold text-ink/70">Dari</span><DateField name="from" value={data.from} aria-label="Dari" class="mt-1" /></div>
	<div><span class="text-xs font-semibold text-ink/70">Sampai</span><DateField name="to" value={data.to} aria-label="Sampai" class="mt-1" /></div>
	<FilterActions />
</form>

{#if data.entries.length === 0}
	<p class="panel p-8 text-center text-muted-foreground">Belum ada jurnal pada periode ini.</p>
{:else}
	<div class="panel px-2 py-1">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Tanggal</Table.Head>
				<Table.Head>Ref</Table.Head>
				<Table.Head>Keterangan</Table.Head>
				<Table.Head>Akun</Table.Head>
				<Table.Head class="text-right">Debit</Table.Head>
				<Table.Head class="text-right">Kredit</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.entries as e (e.id)}
				{#each e.lines as l, i (i)}
					<Table.Row class={i === 0 ? 'border-t-2' : ''}>
						<Table.Cell class="whitespace-nowrap">{i === 0 ? formatDate(e.entryDate) : ''}</Table.Cell>
						<Table.Cell class="whitespace-nowrap">
							{#if i === 0}{e.refNo}{#if e.type === 'OPENING'} <Badge variant="secondary">Saldo awal</Badge>{/if}{/if}
						</Table.Cell>
						<Table.Cell class="max-w-sm min-w-48 whitespace-normal">{i === 0 ? e.description : ''}</Table.Cell>
						<Table.Cell class={l.credit !== '0.00' ? 'pl-8' : ''}>{l.accountCode} {l.accountName}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{l.debit !== '0.00' ? formatIdr(l.debit) : ''}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{l.credit !== '0.00' ? formatIdr(l.credit) : ''}</Table.Cell>
					</Table.Row>
				{/each}
			{/each}
			<Table.Row class="border-t-2 border-border bg-pale font-bold text-deep hover:bg-pale">
				<Table.Cell colspan={4}>Total</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(data.totalDebit)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(data.totalCredit)}</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table.Root>
	</div>
{/if}
