<script lang="ts">
	import SignerPdfButton from '$lib/components/SignerPdfButton.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import DeleteDocumentDialog from '$lib/components/DeleteDocumentDialog.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate, todayIso } from '$lib/dates';
	import { formatAmount } from '$lib/currency';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();

	const canManage = $derived(roleAtLeast(data.ctx.role, 'accountant'));
	let deleteOpen = $state(false);
	let error = $state<string | null>(null);
	let busy = $state(false);

	let issueOpen = $state(false);
	let paymentDate = $state(todayIso());
	let receiptDeleteOpen = $state(false);

	function openIssue() {
		paymentDate = todayIso();
		issueOpen = true;
	}

	async function issueReceipt() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/invoices/${data.invoice.id}/receipt`, { method: 'POST', json: { paymentDate } });
			issueOpen = false;
			await invalidateAll();
		} catch (err) {
			issueOpen = false;
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}

	async function deleteReceipt() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/invoices/${data.invoice.id}/receipt`, { method: 'DELETE' });
			receiptDeleteOpen = false;
			await invalidateAll();
		} catch (err) {
			receiptDeleteOpen = false;
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}

	async function doDelete() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/invoices/${data.invoice.id}`, { method: 'DELETE' });
			deleteOpen = false;
			await goto('/invoicing/invoices');
		} catch (err) {
			deleteOpen = false;
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title={data.invoice.invoiceNo} description={data.contact.name}>
	{#snippet actions()}
		<SignerPdfButton label="Unduh PDF" href="/api/invoicing/invoices/{data.invoice.id}/pdf" signers={data.signers} lastSignerId={data.invoice.lastSignerId} />
		{#if canManage && !data.receipt}<Button variant="outline" onclick={openIssue}>Terbitkan Receipt</Button>{/if}
		{#if canManage}<Button variant="outline" href="/invoicing/invoices/{data.invoice.id}/edit">Ubah</Button>{/if}
		{#if canManage}<Button variant="outline" onclick={() => (deleteOpen = true)}>Hapus</Button>{/if}
	{/snippet}
</PageHeader>
{#if error}<p role="alert" class="mb-4 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{error}</p>{/if}

{#if data.receipt}
	<Card.Root class="mb-6">
		<Card.Header>
			<Card.Title>Payment Receipt</Card.Title>
		</Card.Header>
		<Card.Content class="grid gap-4 text-sm sm:grid-cols-3">
			<div>
				<p class="text-muted-foreground">Nomor receipt</p>
				<p class="font-medium">{data.receipt.receiptNo}</p>
			</div>
			<div>
				<p class="text-muted-foreground">Tanggal pembayaran</p>
				<p class="font-medium">{formatDate(data.receipt.paymentDate)}</p>
			</div>
			<div class="flex flex-wrap items-center gap-2 sm:justify-end">
				<SignerPdfButton variant="outline" label="Unduh PDF Receipt" href="/api/invoicing/invoices/{data.invoice.id}/receipt/pdf" signers={data.signers} lastSignerId={data.receipt?.lastSignerId ?? null} />
				{#if canManage}<Button variant="outline" onclick={() => (receiptDeleteOpen = true)}>Hapus Receipt</Button>{/if}
			</div>
			<p class="text-muted-foreground sm:col-span-3">Receipt sudah terbit. Perubahan pada invoice ini tidak mengubah receipt.</p>
		</Card.Content>
	</Card.Root>
{/if}

<Card.Root class="mb-6">
	<Card.Content class="grid gap-4 pt-6 text-sm sm:grid-cols-4">
		<div>
			<p class="text-muted-foreground">Tanggal invoice</p>
			<p class="font-medium">{formatDate(data.invoice.issueDate)}</p>
		</div>
		{#if data.invoice.dueDate}
			<div>
				<p class="text-muted-foreground">Jatuh tempo</p>
				<p class="font-medium">{formatDate(data.invoice.dueDate)}</p>
			</div>
		{/if}
		<div>
			<p class="text-muted-foreground">Pelanggan</p>
			<p class="font-medium">{data.contact.name}</p>
			{#if data.contact.attention}
				<p class="text-xs text-muted-foreground">Attn: {[data.contact.attention, data.contact.position].filter(Boolean).join(', ')}</p>
			{/if}
		</div>
		<div>
			<p class="text-muted-foreground">Total</p>
			<p class="font-medium tabular-nums">{formatAmount(data.invoice.total, data.invoice.currency)}</p>
		</div>
	</Card.Content>
</Card.Root>

{#if data.invoice.subject}
	<p class="mb-4 text-sm"><span class="text-muted-foreground">Perihal:</span> <span class="font-medium">{data.invoice.subject}</span></p>
{/if}

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
					<Table.Cell class="text-right tabular-nums">{formatAmount(line.unitPrice, data.invoice.currency)}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatAmount(line.amount, data.invoice.currency)}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>

<div class="mt-4 flex flex-col items-end gap-1 text-sm">
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">Subtotal</span><span class="tabular-nums">{formatAmount(data.invoice.subtotal, data.invoice.currency)}</span></div>
	{#if Number(data.invoice.discount) > 0}
		<div class="flex w-64 justify-between"><span class="text-muted-foreground">Diskon</span><span class="tabular-nums">-{formatAmount(data.invoice.discount, data.invoice.currency)}</span></div>
	{/if}
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">PPN</span><span class="tabular-nums">{formatAmount(data.invoice.taxAmount, data.invoice.currency)}</span></div>
	<div class="flex w-64 justify-between font-semibold"><span>Total</span><span class="tabular-nums">{formatAmount(data.invoice.total, data.invoice.currency)}</span></div>
</div>

{#if data.invoice.notes}
	<p class="mt-4 text-sm whitespace-pre-line text-muted-foreground">{data.invoice.notes}</p>
{/if}

<DeleteDocumentDialog bind:open={deleteOpen} title="Hapus invoice" name={data.invoice.invoiceNo} {busy} onconfirm={doDelete} />

{#if data.receipt}
	<DeleteDocumentDialog bind:open={receiptDeleteOpen} title="Hapus receipt" name={data.receipt.receiptNo} {busy} onconfirm={deleteReceipt} />
{/if}

<Dialog.Root bind:open={issueOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Terbitkan Receipt</Dialog.Title>
			<Dialog.Description>Receipt dibuat sebagai salinan tetap dari invoice ini.</Dialog.Description>
		</Dialog.Header>
		<FormField id="receipt-payment-date" label="Tanggal pembayaran">
			<DateField bind:value={paymentDate} id="receipt-payment-date" aria-label="Tanggal pembayaran" />
		</FormField>
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (issueOpen = false)}>Batal</Button>
			<Button type="button" disabled={busy || !paymentDate} onclick={issueReceipt}>Simpan</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
