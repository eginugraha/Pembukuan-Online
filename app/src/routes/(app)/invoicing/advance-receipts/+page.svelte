<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/table';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();
	const STATUS_LABELS = { ACTIVE: 'Aktif', APPLIED: 'Terpakai', REFUNDED: 'Dibatalkan' } as const;
	// Terpakai (sudah dipakai melunasi invoice) vs Dibatalkan (dikembalikan, mati) dibedakan seperti
	// badge lain di aplikasi: secondary untuk status "selesai terpakai", outline untuk yang nonaktif.
	const STATUS_VARIANTS = { ACTIVE: 'default', APPLIED: 'secondary', REFUNDED: 'outline' } as const;
	type AdvanceReceipt = (typeof data.advanceReceipts)[number];
	const RECEIPT_COLUMNS: Column<AdvanceReceipt>[] = [
		{ key: 'receiptNo', label: 'No.', sortable: true, searchable: true, text: (r) => r.receiptNo },
		{ key: 'contactName', label: 'Pelanggan', sortable: true, searchable: true, text: (r) => r.contactName },
		{ key: 'receiptDate', label: 'Tanggal', sortable: true, text: (r) => formatDate(r.receiptDate) },
		{ key: 'amount', label: 'Jumlah', align: 'right', sortable: true, sortValue: (r) => Number(r.amount), text: (r) => formatIdr(r.amount) },
		{ key: 'status', label: 'Status', sortable: true, text: (r) => STATUS_LABELS[r.status] }
	];
	const canManage = $derived(roleAtLeast(data.ctx.role, 'accountant'));
</script>

<PageHeader title="Uang Muka" description="Daftar uang muka (advance receipt) dari pelanggan.">
	{#snippet actions()}
		{#if canManage}<Button href="/invoicing/advance-receipts/new">Catat Uang Muka</Button>{/if}
	{/snippet}
</PageHeader>

<DataTable rows={data.advanceReceipts} columns={RECEIPT_COLUMNS} rowKey={(r) => r.id} searchPlaceholder="Cari no. uang muka atau pelanggan…" emptyText="Belum ada uang muka.">
	{#snippet cell(r, col)}
		{#if col.key === 'receiptNo'}
			{r.receiptNo}
		{:else if col.key === 'contactName'}
			{r.contactName}
		{:else if col.key === 'receiptDate'}
			{formatDate(r.receiptDate)}
		{:else if col.key === 'amount'}
			{formatIdr(r.amount)}
		{:else if col.key === 'status'}
			<Badge variant={STATUS_VARIANTS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
		{/if}
	{/snippet}
</DataTable>
