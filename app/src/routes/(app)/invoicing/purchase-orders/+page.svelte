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
	import { formatIdr } from '$lib/money';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();
	type PO = (typeof data.purchaseOrders)[number];
	const PO_COLUMNS: Column<PO>[] = [
		{ key: 'poNo', label: 'Nomor', sortable: true, searchable: true, text: (p) => p.poNo },
		{ key: 'contactName', label: 'Pemasok', sortable: true, searchable: true, text: (p) => p.contactName },
		{ key: 'issueDate', label: 'Tanggal', sortable: true, text: (p) => formatDate(p.issueDate) },
		{ key: 'total', label: 'Total', align: 'right', sortable: true, sortValue: (p) => Number(p.total), text: (p) => formatIdr(p.total) },
		{ key: 'actions', label: 'Aksi' }
	];
	const canManage = $derived(roleAtLeast(data.ctx.role, 'accountant'));

	let deleting = $state<PO | null>(null);
	let deleteOpen = $state(false);
	let busy = $state(false);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function confirmDelete() {
		if (!deleting) return;
		message = errorMessage = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/purchase-orders/${deleting.id}`, { method: 'DELETE' });
			deleteOpen = false;
			message = 'Purchase order dihapus.';
			await invalidateAll();
		} catch (err) {
			deleteOpen = false;
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Purchase Order" description="Daftar purchase order untuk pemasok.">
	{#snippet actions()}
		{#if canManage}<Button href="/invoicing/purchase-orders/new">Buat PO</Button>{/if}
	{/snippet}
</PageHeader>
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<DataTable rows={data.purchaseOrders} columns={PO_COLUMNS} rowKey={(p) => p.id} searchPlaceholder="Cari no. PO atau pemasok…" emptyText="Belum ada purchase order.">
	{#snippet cell(p, col)}
		{#if col.key === 'poNo'}
			{p.poNo}
		{:else if col.key === 'contactName'}
			{p.contactName}
		{:else if col.key === 'issueDate'}
			{formatDate(p.issueDate)}
		{:else if col.key === 'total'}
			{formatIdr(p.total)}
		{:else if col.key === 'actions'}
			<span class="flex gap-1">
				<Button size="sm" variant="ghost" href="/invoicing/purchase-orders/{p.id}">Lihat</Button>
				<Button size="sm" variant="ghost" href="/api/invoicing/purchase-orders/{p.id}/pdf">PDF</Button>
				{#if canManage}
					<Button size="sm" variant="ghost" href="/invoicing/purchase-orders/{p.id}/edit">Ubah</Button>
					<Button size="sm" variant="ghost" onclick={() => { deleting = p; deleteOpen = true; }}>Hapus</Button>
				{/if}
			</span>
		{/if}
	{/snippet}
</DataTable>

<DeleteDocumentDialog bind:open={deleteOpen} title="Hapus purchase order" name={deleting?.poNo ?? ''} {busy} onconfirm={confirmDelete} />
