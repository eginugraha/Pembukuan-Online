<script lang="ts">
	import SignerPdfButton from '$lib/components/SignerPdfButton.svelte';
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import DataTable from '$lib/components/DataTable.svelte';
	import DeleteDocumentDialog from '$lib/components/DeleteDocumentDialog.svelte';
	import QuotationStatusBadge from '$lib/components/QuotationStatusBadge.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import type { Column } from '$lib/table';
	import { apiFetch } from '$lib/api-client';
	import { formatDate } from '$lib/dates';
	import { formatAmount } from '$lib/currency';
	import { QUOTATION_STATUS_LABEL } from '$lib/quotation-status';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();
	type Quotation = (typeof data.quotations)[number];
	const COLUMNS: Column<Quotation>[] = [
		{ key: 'quotationNo', label: 'Nomor', sortable: true, searchable: true, text: (q) => q.quotationNo },
		{ key: 'contactName', label: 'Pelanggan', sortable: true, searchable: true, text: (q) => q.contactName },
		{ key: 'issueDate', label: 'Tanggal', sortable: true, text: (q) => formatDate(q.issueDate) },
		{ key: 'validUntil', label: 'Berlaku sampai', sortable: true, text: (q) => (q.validUntil ? formatDate(q.validUntil) : '') },
		{ key: 'total', label: 'Total', align: 'right', sortable: true, sortValue: (q) => Number(q.total), text: (q) => formatAmount(q.total, q.currency) },
		{ key: 'status', label: 'Status', sortable: true, text: (q) => QUOTATION_STATUS_LABEL[q.status] },
		{ key: 'actions', label: 'Aksi' }
	];
	const STATUS_OPTIONS = [
		{ value: '', label: 'Semua status' },
		{ value: 'pending', label: QUOTATION_STATUS_LABEL.pending },
		{ value: 'approved', label: QUOTATION_STATUS_LABEL.approved },
		{ value: 'expired', label: QUOTATION_STATUS_LABEL.expired }
	];
	const canManage = $derived(roleAtLeast(data.ctx.role, 'accountant'));
	let statusFilter = $state('');
	const rows = $derived(statusFilter ? data.quotations.filter((q) => q.status === statusFilter) : data.quotations);

	let deleting = $state<Quotation | null>(null);
	let deleteOpen = $state(false);
	let busy = $state(false);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function confirmDelete() {
		if (!deleting) return;
		message = errorMessage = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/quotations/${deleting.id}`, { method: 'DELETE' });
			deleteOpen = false;
			message = 'Penawaran dihapus.';
			await invalidateAll();
		} catch (err) {
			deleteOpen = false;
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Penawaran" description="Penawaran harga (quotation) untuk calon pelanggan.">
	{#snippet actions()}
		{#if canManage}<Button href="/invoicing/quotations/new">Buat Penawaran</Button>{/if}
	{/snippet}
</PageHeader>
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<div class="mb-4 w-full max-w-56">
	<SimpleSelect id="quotation-status-filter" aria-label="Filter status" bind:value={statusFilter} options={STATUS_OPTIONS} />
</div>

<DataTable {rows} columns={COLUMNS} rowKey={(q) => q.id} searchPlaceholder="Cari no. penawaran atau pelanggan…" emptyText="Belum ada penawaran.">
	{#snippet cell(q, col)}
		{#if col.key === 'quotationNo'}
			{q.quotationNo}
		{:else if col.key === 'contactName'}
			{q.contactName}
		{:else if col.key === 'issueDate'}
			{formatDate(q.issueDate)}
		{:else if col.key === 'validUntil'}
			{q.validUntil ? formatDate(q.validUntil) : '–'}
		{:else if col.key === 'total'}
			{formatAmount(q.total, q.currency)}
		{:else if col.key === 'status'}
			<QuotationStatusBadge status={q.status} />
		{:else if col.key === 'actions'}
			<span class="flex gap-1">
				<Button size="sm" variant="ghost" href="/invoicing/quotations/{q.id}">Lihat</Button>
				<SignerPdfButton size="sm" variant="ghost" label="PDF" href="/api/invoicing/quotations/{q.id}/pdf" signers={data.signers} lastSignerId={q.lastSignerId} />
				{#if canManage && q.status !== 'approved'}
					<Button size="sm" variant="ghost" href="/invoicing/quotations/{q.id}/edit">Ubah</Button>
					<Button size="sm" variant="ghost" onclick={() => { deleting = q; deleteOpen = true; }}>Hapus</Button>
				{/if}
			</span>
		{/if}
	{/snippet}
</DataTable>

<DeleteDocumentDialog bind:open={deleteOpen} title="Hapus penawaran" name={deleting?.quotationNo ?? ''} {busy} onconfirm={confirmDelete} />
