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

	const STATUS_LABELS = { DRAFT: 'Draft', SENT: 'Terkirim', PAID: 'Lunas', CANCELLED: 'Dibatalkan' } as const;
	const canSend = $derived(data.invoice.status === 'DRAFT' && roleAtLeast(data.ctx.role, 'accountant'));
	const canPay = $derived(data.invoice.status === 'SENT' && roleAtLeast(data.ctx.role, 'accountant'));
	const cancelRole = $derived(data.invoice.status === 'DRAFT' ? 'accountant' : 'admin');
	const canCancel = $derived(data.invoice.status !== 'CANCELLED' && roleAtLeast(data.ctx.role, cancelRole));

	let sendOpen = $state(false);
	let sendDate = $state('');
	let payOpen = $state(false);
	let payDate = $state('');
	let cancelOpen = $state(false);
	let error = $state<string | null>(null);
	let busy = $state(false);

	function askSend() {
		sendDate = todayIso();
		error = null;
		sendOpen = true;
	}

	async function doSend() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/invoices/${data.invoice.id}/send`, { method: 'POST', json: { date: sendDate } });
			sendOpen = false;
			await invalidateAll();
		} catch (err) {
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}

	function askPay() {
		payDate = todayIso();
		error = null;
		payOpen = true;
	}

	async function doPay() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/invoices/${data.invoice.id}/pay`, { method: 'POST', json: { date: payDate, method: 'BANK' } });
			payOpen = false;
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
			await apiFetch(`/api/invoicing/invoices/${data.invoice.id}/cancel`, { method: 'POST', json: {} });
			cancelOpen = false;
			await invalidateAll();
		} catch (err) {
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title={data.invoice.invoiceNo ?? 'Draft'} description={data.contact.name}>
	{#snippet actions()}
		{#if canSend}<Button onclick={askSend}>Kirim</Button>{/if}
		{#if canPay}<Button onclick={askPay}>Bayar dari Bank</Button>{/if}
		{#if canCancel}<Button variant="outline" onclick={askCancel}>Batalkan</Button>{/if}
	{/snippet}
</PageHeader>

<Card.Root class="mb-6">
	<Card.Content class="grid grid-cols-2 gap-4 pt-6 text-sm sm:grid-cols-4">
		<div>
			<p class="text-muted-foreground">Status</p>
			<Badge variant={data.invoice.status === 'DRAFT' ? 'outline' : 'default'}>{STATUS_LABELS[data.invoice.status]}</Badge>
		</div>
		<div>
			<p class="text-muted-foreground">Tanggal invoice</p>
			<p class="font-medium">{formatDate(data.invoice.issueDate)}</p>
		</div>
		<div>
			<p class="text-muted-foreground">Pelanggan</p>
			<p class="font-medium">{data.contact.name}</p>
		</div>
		<div>
			<p class="text-muted-foreground">Total</p>
			<p class="font-medium tabular-nums">{formatIdr(data.invoice.total)}</p>
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
			{#each data.invoice.lines as line (line.id)}
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
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">Subtotal</span><span class="tabular-nums">{formatIdr(data.invoice.subtotal)}</span></div>
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">PPN</span><span class="tabular-nums">{formatIdr(data.invoice.taxAmount)}</span></div>
	<div class="flex w-64 justify-between font-semibold"><span>Total</span><span class="tabular-nums">{formatIdr(data.invoice.total)}</span></div>
</div>

{#if data.invoice.notes}
	<p class="mt-4 text-sm text-muted-foreground">{data.invoice.notes}</p>
{/if}

<Dialog.Root bind:open={sendOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Kirim invoice?</Dialog.Title>
			<Dialog.Description>Invoice akan diberi nomor urut dan jurnalnya diposting (Dr piutang / Cr pendapatan).</Dialog.Description>
		</Dialog.Header>
		<FormField id="send-date" label="Tanggal kirim">
			<DateField id="send-date" bind:value={sendDate} />
		</FormField>
		{#if error}<p role="alert" class="text-sm font-medium text-destructive">{error}</p>{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (sendOpen = false)}>Batal</Button>
			<Button type="button" disabled={busy || !sendDate} onclick={doSend}>{busy ? 'Mengirim…' : 'Kirim'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={payOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Bayar dari bank?</Dialog.Title>
			<Dialog.Description>Jurnal pelunasan akan diposting (Dr bank / Cr piutang) dan invoice ditandai Lunas.</Dialog.Description>
		</Dialog.Header>
		<FormField id="pay-date" label="Tanggal bayar">
			<DateField id="pay-date" bind:value={payDate} />
		</FormField>
		{#if error}<p role="alert" class="text-sm font-medium text-destructive">{error}</p>{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (payOpen = false)}>Batal</Button>
			<Button type="button" disabled={busy || !payDate} onclick={doPay}>{busy ? 'Memproses…' : 'Bayar'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={cancelOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Batalkan invoice?</Dialog.Title>
			<Dialog.Description>
				{data.invoice.status === 'DRAFT'
					? 'Invoice Draft akan dibatalkan tanpa jurnal.'
					: 'Jurnal yang sudah diposting akan dibalik (Pembalikan) dan invoice ditandai Dibatalkan.'}
			</Dialog.Description>
		</Dialog.Header>
		{#if error}<p role="alert" class="text-sm font-medium text-destructive">{error}</p>{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (cancelOpen = false)}>Batal</Button>
			<Button type="button" variant="destructive" disabled={busy} onclick={doCancel}>{busy ? 'Memproses…' : 'Batalkan'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
