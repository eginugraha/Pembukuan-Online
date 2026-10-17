<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatIdr } from '$lib/money';
	import DateField from '$lib/components/DateField.svelte';
	import FilterActions from '$lib/components/FilterActions.svelte';

	let { data } = $props();
	const tb = $derived(data.tb);
</script>

<PageHeader title="Neraca Saldo">
	{#snippet actions()}
		<Badge variant={tb.balanced ? 'success' : 'destructive'}>{tb.balanced ? 'Balance' : 'Tidak balance'}</Badge>
	{/snippet}
</PageHeader>

<form method="GET" class="panel mb-5 flex flex-wrap items-end gap-3 p-4">
	<div><span class="text-xs font-semibold text-ink/70">Per tanggal</span><DateField name="as_of" value={tb.asOf} aria-label="Per tanggal" class="mt-1" /></div>
	<FilterActions />
</form>

{#if tb.rows.length === 0}
	<p class="panel p-8 text-center text-muted-foreground">Belum ada saldo pada tanggal ini.</p>
{:else}
	<div class="panel px-2 py-1">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Kode</Table.Head>
				<Table.Head>Akun</Table.Head>
				<Table.Head class="text-right">Debit</Table.Head>
				<Table.Head class="text-right">Kredit</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each tb.rows as r (r.accountId)}
				<Table.Row>
					<Table.Cell>{r.code}</Table.Cell>
					<Table.Cell>{r.name}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{r.debit !== '0.00' ? formatIdr(r.debit) : ''}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{r.credit !== '0.00' ? formatIdr(r.credit) : ''}</Table.Cell>
				</Table.Row>
			{/each}
			<Table.Row class="border-t-2 border-border bg-pale font-bold text-deep hover:bg-pale">
				<Table.Cell colspan={2}>Total</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(tb.totalDebit)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(tb.totalCredit)}</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table.Root>
	</div>
{/if}
