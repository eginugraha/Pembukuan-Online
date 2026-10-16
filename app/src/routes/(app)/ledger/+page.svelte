<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import { inputClass, selectClass } from '$lib/ui';

	let { data } = $props();
</script>

<PageHeader title="Buku Besar" />

<form method="GET" class="panel mb-5 flex flex-wrap items-end gap-3 p-4">
	<label class="min-w-72 text-xs font-semibold text-ink/70">Akun
		<select name="account_id" class="{selectClass} mt-1" value={data.accountId} required>
			<option value="" disabled>Pilih akun…</option>
			{#each data.accounts as a (a.id)}<option value={a.id}>{a.code} {a.name}</option>{/each}
		</select>
	</label>
	<label class="text-xs font-semibold text-ink/70">Dari<input type="date" name="from" value={data.from} class="{inputClass} mt-1" /></label>
	<label class="text-xs font-semibold text-ink/70">Sampai<input type="date" name="to" value={data.to} class="{inputClass} mt-1" /></label>
	<Button type="submit" variant="outline">Tampilkan</Button>
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
			<Table.Row class="border-t-2 border-border bg-pale font-bold text-deep hover:bg-pale">
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
