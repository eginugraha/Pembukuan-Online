<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import DateField from '$lib/components/DateField.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate, todayIso } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();

	const STATUS_LABELS = { DRAFT: 'Draft', ISSUED: 'Diterbitkan', RECEIVED: 'Diterima', CANCELLED: 'Dibatalkan' } as const;
	const canIssue = $derived(data.po.status === 'DRAFT' && roleAtLeast(data.ctx.role, 'accountant'));
	const canReceive = $derived(data.po.status === 'ISSUED' && roleAtLeast(data.ctx.role, 'accountant'));
	const cancelRole = $derived(data.po.status === 'RECEIVED' ? 'admin' : 'accountant');
	const canCancel = $derived(data.po.status !== 'CANCELLED' && roleAtLeast(data.ctx.role, cancelRole));

	let issueOpen = $state(false);
	let receiveOpen = $state(false);
	let receiveDate = $state('');
	let cancelOpen = $state(false);
	let error = $state<string | null>(null);
	let busy = $state(false);

	function askIssue() {
		error = null;
		issueOpen = true;
	}

	async function doIssue() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/purchase-orders/${data.po.id}/issue`, { method: 'POST', json: {} });
			issueOpen = false;
			await invalidateAll();
		} catch (err) {
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}

	function askReceive() {
		receiveDate = todayIso();
		error = null;
		receiveOpen = true;
	}

	async function doReceive() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/purchase-orders/${data.po.id}/receive`, { method: 'POST', json: { date: receiveDate } });
			receiveOpen = false;
			await invalidateAll();
		} catch (err) {
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}

	function askCancel() {
		error = null;
		cancelOpen = true;
	}

	async function doCancel() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/purchase-orders/${data.po.id}/cancel`, { method: 'POST', json: {} });
			cancelOpen = false;
			await invalidateAll();
		} catch (err) {
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title={data.po.poNo ?? 'Draft'} description={data.contact.name}>
	{#snippet actions()}
		<Button href="/api/invoicing/purchase-orders/{data.po.id}/pdf">Unduh PDF</Button>
		{#if canIssue}<Button onclick={askIssue}>Terbitkan</Button>{/if}
		{#if canReceive}<Button onclick={askReceive}>Terima</Button>{/if}
		{#if canCancel}<Button variant="outline" onclick={askCancel}>Batalkan</Button>{/if}
	{/snippet}
</PageHeader>

<Card.Root class="mb-6">
	<Card.Content class="grid grid-cols-2 gap-4 pt-6 text-sm sm:grid-cols-4">
		<div>
			<p class="text-muted-foreground">Status</p>
			<Badge variant={data.po.status === 'DRAFT' ? 'outline' : 'default'}>{STATUS_LABELS[data.po.status]}</Badge>
		</div>
		<div>
			<p class="text-muted-foreground">Tanggal PO</p>
			<p class="font-medium">{formatDate(data.po.issueDate)}</p>
		</div>
		<div>
			<p class="text-muted-foreground">Pemasok</p>
			<p class="font-medium">{data.contact.name}</p>
		</div>
		<div>
			<p class="text-muted-foreground">Total</p>
			<p class="font-medium tabular-nums">{formatIdr(data.po.total)}</p>
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
					<Table.Cell class="text-right tabular-nums">{formatIdr(line.unitPrice)}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatIdr(line.amount)}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>

<div class="mt-4 flex flex-col items-end gap-1 text-sm">
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">Subtotal</span><span class="tabular-nums">{formatIdr(data.po.subtotal)}</span></div>
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">PPN</span><span class="tabular-nums">{formatIdr(data.po.taxAmount)}</span></div>
	<div class="flex w-64 justify-between font-semibold"><span>Total</span><span class="tabular-nums">{formatIdr(data.po.total)}</span></div>
</div>

{#if data.po.notes}
	<p class="mt-4 text-sm text-muted-foreground">{data.po.notes}</p>
{/if}

<Dialog.Root bind:open={issueOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Terbitkan PO?</Dialog.Title>
			<Dialog.Description>PO akan diberi nomor urut. Tidak ada jurnal yang diposting.</Dialog.Description>
		</Dialog.Header>
		{#if error}<p role="alert" class="text-sm font-medium text-destructive">{error}</p>{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (issueOpen = false)}>Batal</Button>
			<Button type="button" disabled={busy} onclick={doIssue}>{busy ? 'Menerbitkan…' : 'Terbitkan'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={receiveOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Terima PO?</Dialog.Title>
			<Dialog.Description>Jurnal penerimaan akan diposting (Dr biaya / Cr utang usaha) dan PO ditandai Diterima.</Dialog.Description>
		</Dialog.Header>
		<FormField id="receive-date" label="Tanggal terima">
			<DateField id="receive-date" bind:value={receiveDate} />
		</FormField>
		{#if error}<p role="alert" class="text-sm font-medium text-destructive">{error}</p>{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (receiveOpen = false)}>Batal</Button>
			<Button type="button" disabled={busy || !receiveDate} onclick={doReceive}>{busy ? 'Memproses…' : 'Terima'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={cancelOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Batalkan PO?</Dialog.Title>
			<Dialog.Description>
				{data.po.status === 'RECEIVED'
					? 'Jurnal yang sudah diposting akan dibalik (Pembalikan) dan PO ditandai Dibatalkan.'
					: 'PO akan dibatalkan tanpa jurnal.'}
			</Dialog.Description>
		</Dialog.Header>
		{#if error}<p role="alert" class="text-sm font-medium text-destructive">{error}</p>{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (cancelOpen = false)}>Batal</Button>
			<Button type="button" variant="destructive" disabled={busy} onclick={doCancel}>{busy ? 'Memproses…' : 'Batalkan'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
