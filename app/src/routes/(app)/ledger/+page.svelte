<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate, monthRange, todayIso } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import DateField from '$lib/components/DateField.svelte';
	import FilterActions from '$lib/components/FilterActions.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { accountOptions as toAccountOptions } from '$lib/account-options';


	let { data } = $props();
	const month = monthRange(todayIso());
	const active = $derived(data.from !== month.from || data.to !== month.to || data.accountId !== '');
</script>

<PageHeader title="Buku Besar" />

<form method="GET" class="panel mb-5 flex flex-wrap items-end gap-3 p-4">
	<div class="min-w-72">
		<label for="ledger-account" class="text-xs font-semibold text-ink/70">Akun</label>
		<SearchSelect
			id="ledger-account"
			name="account_id"
			class="mt-1"
			value={data.accountId}
			options={toAccountOptions(data.accounts)}
			placeholder="Pilih akun…"
			searchPlaceholder="Cari kode atau nama akun…"
			emptyText="Tidak ada akun yang cocok"
		/>
	</div>
	<div><span class="text-xs font-semibold text-ink/70">Dari</span><DateField name="from" value={data.from} aria-label="Dari" class="mt-1" /></div>
	<div><span class="text-xs font-semibold text-ink/70">Sampai</span><DateField name="to" value={data.to} aria-label="Sampai" class="mt-1" /></div>
	<FilterActions active={active} />
</form>

{#if data.ledger}
	{@const l = data.ledger}
	<h2 class="mb-2 font-medium">{l.account.code} {l.account.name} <span class="text-sm text-muted-foreground">(saldo normal {l.account.normalBal === 'DEBIT' ? 'debit' : 'kredit'})</span></h2>
	<div class="panel px-2 py-1">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Tanggal</Table.Head>
				<Table.Head>Ref</Table.Head>
				<Table.Head>Keterangan</Table.Head>
				<Table.Head class="text-right">Debit</Table.Head>
				<Table.Head class="text-right">Kredit</Table.Head>
				<Table.Head class="text-right">Saldo</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			<Table.Row class="bg-pale/60">
				<Table.Cell colspan={5}>Saldo awal per {formatDate(data.from)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(l.openingBalance)}</Table.Cell>
			</Table.Row>
			{#each l.lines as line, i (i)}
				<Table.Row>
					<Table.Cell class="whitespace-nowrap">{formatDate(line.entryDate)}</Table.Cell>
					<Table.Cell>{line.refNo}</Table.Cell>
					<Table.Cell class="max-w-sm min-w-48 whitespace-normal">{line.description}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{line.debit !== '0.00' ? formatIdr(line.debit) : ''}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{line.credit !== '0.00' ? formatIdr(line.credit) : ''}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatIdr(line.balance)}</Table.Cell>
				</Table.Row>
			{/each}
			<Table.Row class="total-row">
				<Table.Cell colspan={3}>Mutasi & saldo akhir per {formatDate(data.to)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(l.totalDebit)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(l.totalCredit)}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{formatIdr(l.closingBalance)}</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table.Root>
	</div>
{:else}
	<p class="panel p-8 text-center text-muted-foreground">Pilih akun untuk melihat buku besar.</p>
{/if}
