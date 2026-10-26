<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import DataTable from '$lib/components/DataTable.svelte';
	import DeleteDocumentDialog from '$lib/components/DeleteDocumentDialog.svelte';
	import type { Column } from '$lib/table';
	import { apiFetch } from '$lib/api-client';
	import { formatDate } from '$lib/dates';
	import { formatAmount } from '$lib/currency';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();
	type Invoice = (typeof data.invoices)[number];
	const INVOICE_COLUMNS: Column<Invoice>[] = [
		{ key: 'invoiceNo', label: 'Nomor', sortable: true, searchable: true, text: (i) => i.invoiceNo },
		{ key: 'contactName', label: 'Pelanggan', sortable: true, searchable: true, text: (i) => i.contactName },
		{ key: 'issueDate', label: 'Tanggal', sortable: true, text: (i) => formatDate(i.issueDate) },
		{ key: 'total', label: 'Total', align: 'right', sortable: true, sortValue: (i) => Number(i.total), text: (i) => formatAmount(i.total, i.currency) },
		{ key: 'actions', label: 'Aksi' }
	];
	const canManage = $derived(roleAtLeast(data.ctx.role, 'accountant'));

	let deleting = $state<Invoice | null>(null);
	let deleteOpen = $state(false);
	let busy = $state(false);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function confirmDelete() {
		if (!deleting) return;
		message = errorMessage = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/invoices/${deleting.id}`, { method: 'DELETE' });
			deleteOpen = false;
			message = 'Invoice dihapus.';
			await invalidateAll();
		} catch (err) {
			deleteOpen = false;
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Invoice" description="Daftar invoice penjualan untuk pelanggan.">
	{#snippet actions()}
		{#if canManage}<Button href="/invoicing/invoices/new">Buat Invoice</Button>{/if}
	{/snippet}
</PageHeader>
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<DataTable rows={data.invoices} columns={INVOICE_COLUMNS} rowKey={(i) => i.id} searchPlaceholder="Cari no. invoice atau pelanggan…" emptyText="Belum ada invoice.">
	{#snippet cell(i, col)}
		{#if col.key === 'invoiceNo'}
			{i.invoiceNo}
		{:else if col.key === 'contactName'}
			{i.contactName}
		{:else if col.key === 'issueDate'}
			{formatDate(i.issueDate)}
		{:else if col.key === 'total'}
			{formatAmount(i.total, i.currency)}
		{:else if col.key === 'actions'}
			<span class="flex gap-1">
				<Button size="sm" variant="ghost" href="/invoicing/invoices/{i.id}">Lihat</Button>
				<Button size="sm" variant="ghost" href="/api/invoicing/invoices/{i.id}/pdf">PDF</Button>
				{#if canManage}
					<Button size="sm" variant="ghost" href="/invoicing/invoices/{i.id}/edit">Ubah</Button>
					<Button size="sm" variant="ghost" onclick={() => { deleting = i; deleteOpen = true; }}>Hapus</Button>
				{/if}
			</span>
		{/if}
	{/snippet}
</DataTable>

<DeleteDocumentDialog bind:open={deleteOpen} title="Hapus invoice" name={deleting?.invoiceNo ?? ''} {busy} onconfirm={confirmDelete} />
