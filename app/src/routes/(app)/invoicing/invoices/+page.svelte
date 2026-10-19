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
	const STATUS_LABELS = { DRAFT: 'Draft', SENT: 'Terkirim', PAID: 'Lunas', CANCELLED: 'Dibatalkan' } as const;
	type Invoice = (typeof data.invoices)[number];
	const INVOICE_COLUMNS: Column<Invoice>[] = [
		{ key: 'invoiceNo', label: 'No./Draft', sortable: true, searchable: true, text: (i) => i.invoiceNo ?? 'Draft' },
		{ key: 'contactName', label: 'Pelanggan', sortable: true, searchable: true, text: (i) => i.contactName },
		{ key: 'issueDate', label: 'Tanggal', sortable: true, text: (i) => formatDate(i.issueDate) },
		{ key: 'total', label: 'Total', align: 'right', sortable: true, sortValue: (i) => Number(i.total), text: (i) => formatIdr(i.total) },
		{ key: 'status', label: 'Status', sortable: true, text: (i) => STATUS_LABELS[i.status] }
	];
	const canManage = $derived(roleAtLeast(data.ctx.role, 'accountant'));
</script>

<PageHeader title="Invoice" description="Daftar invoice penjualan untuk pelanggan.">
	{#snippet actions()}
		{#if canManage}<Button href="/invoicing/invoices/new">Buat Invoice</Button>{/if}
	{/snippet}
</PageHeader>

<DataTable rows={data.invoices} columns={INVOICE_COLUMNS} rowKey={(i) => i.id} searchPlaceholder="Cari no. invoice atau pelanggan…" emptyText="Belum ada invoice.">
	{#snippet cell(i, col)}
		{#if col.key === 'invoiceNo'}
			{i.invoiceNo ?? 'Draft'}
		{:else if col.key === 'contactName'}
			{i.contactName}
		{:else if col.key === 'issueDate'}
			{formatDate(i.issueDate)}
		{:else if col.key === 'total'}
			{formatIdr(i.total)}
		{:else if col.key === 'status'}
			<Badge variant={i.status === 'DRAFT' ? 'outline' : 'default'}>{STATUS_LABELS[i.status]}</Badge>
		{/if}
	{/snippet}
</DataTable>
