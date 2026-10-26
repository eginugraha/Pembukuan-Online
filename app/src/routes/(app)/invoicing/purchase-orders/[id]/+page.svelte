<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import DeleteDocumentDialog from '$lib/components/DeleteDocumentDialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/dates';
	import { formatAmount } from '$lib/currency';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();

	const canManage = $derived(roleAtLeast(data.ctx.role, 'accountant'));
	let deleteOpen = $state(false);
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function doDelete() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/purchase-orders/${data.po.id}`, { method: 'DELETE' });
			deleteOpen = false;
			await goto('/invoicing/purchase-orders');
		} catch (err) {
			deleteOpen = false;
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title={data.po.poNo} description={data.contact.name}>
	{#snippet actions()}
		<Button href="/api/invoicing/purchase-orders/{data.po.id}/pdf">Unduh PDF</Button>
		{#if canManage}<Button variant="outline" href="/invoicing/purchase-orders/{data.po.id}/edit">Ubah</Button>{/if}
		{#if canManage}<Button variant="outline" onclick={() => (deleteOpen = true)}>Hapus</Button>{/if}
	{/snippet}
</PageHeader>
{#if error}<p role="alert" class="mb-4 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{error}</p>{/if}

<Card.Root class="mb-6">
	<Card.Content class="grid gap-4 pt-6 text-sm sm:grid-cols-3">
		<div>
			<p class="text-muted-foreground">Tanggal PO</p>
			<p class="font-medium">{formatDate(data.po.issueDate)}</p>
		</div>
		{#if data.po.subject}
			<div class="sm:col-span-3">
				<p class="text-muted-foreground">Perihal</p>
				<p class="font-medium">{data.po.subject}</p>
			</div>
		{/if}
		<div>
			<p class="text-muted-foreground">Pemasok</p>
			<p class="font-medium">{data.contact.name}</p>
			{#if data.contact.attention}
				<p class="text-xs text-muted-foreground">Attn: {[data.contact.attention, data.contact.position].filter(Boolean).join(', ')}</p>
			{/if}
		</div>
		{#if data.po.expectedDate}
			<div>
				<p class="text-muted-foreground">Perkiraan tiba</p>
				<p class="font-medium">{formatDate(data.po.expectedDate)}</p>
			</div>
		{/if}
		<div>
			<p class="text-muted-foreground">Total</p>
			<p class="font-medium tabular-nums">{formatAmount(data.po.total, data.po.currency)}</p>
		</div>
	</Card.Content>
</Card.Root>

<div class="panel px-2 py-1">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Keterangan</Table.Head>
				<Table.Head class="w-28 text-right">Kuantitas</Table.Head>
				<Table.Head class="w-40 text-right">Harga satuan</Table.Head>
				<Table.Head class="w-32 text-right">Jumlah</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.po.lines as line (line.id)}
				<Table.Row>
					<Table.Cell>{line.description}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{line.quantity}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatAmount(line.unitPrice, data.po.currency)}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatAmount(line.amount, data.po.currency)}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>

<div class="mt-4 flex flex-col items-end gap-1 text-sm">
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">Subtotal</span><span class="tabular-nums">{formatAmount(data.po.subtotal, data.po.currency)}</span></div>
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">PPN</span><span class="tabular-nums">{formatAmount(data.po.taxAmount, data.po.currency)}</span></div>
	<div class="flex w-64 justify-between font-semibold"><span>Total</span><span class="tabular-nums">{formatAmount(data.po.total, data.po.currency)}</span></div>
</div>

{#if data.po.notes}
	<p class="mt-4 text-sm whitespace-pre-line text-muted-foreground">{data.po.notes}</p>
{/if}

<DeleteDocumentDialog bind:open={deleteOpen} title="Hapus purchase order" name={data.po.poNo} {busy} onconfirm={doDelete} />
