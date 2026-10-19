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
	const STATUS_LABELS = { DRAFT: 'Draft', ISSUED: 'Diterbitkan', RECEIVED: 'Diterima', CANCELLED: 'Dibatalkan' } as const;
	type PO = (typeof data.purchaseOrders)[number];
	const PO_COLUMNS: Column<PO>[] = [
		{ key: 'poNo', label: 'No./Draft', sortable: true, searchable: true, text: (p) => p.poNo ?? 'Draft' },
		{ key: 'contactName', label: 'Pemasok', sortable: true, searchable: true, text: (p) => p.contactName },
		{ key: 'issueDate', label: 'Tanggal', sortable: true, text: (p) => formatDate(p.issueDate) },
		{ key: 'total', label: 'Total', align: 'right', sortable: true, sortValue: (p) => Number(p.total), text: (p) => formatIdr(p.total) },
		{ key: 'status', label: 'Status', sortable: true, text: (p) => STATUS_LABELS[p.status] }
	];
	const canManage = $derived(roleAtLeast(data.ctx.role, 'accountant'));
</script>

<PageHeader title="Purchase Order" description="Daftar purchase order untuk pemasok.">
	{#snippet actions()}
		{#if canManage}<Button href="/invoicing/purchase-orders/new">Buat PO</Button>{/if}
	{/snippet}
</PageHeader>

<DataTable rows={data.purchaseOrders} columns={PO_COLUMNS} rowKey={(p) => p.id} searchPlaceholder="Cari no. PO atau pemasok…" emptyText="Belum ada purchase order.">
	{#snippet cell(p, col)}
		{#if col.key === 'poNo'}
			{p.poNo ?? 'Draft'}
		{:else if col.key === 'contactName'}
			{p.contactName}
		{:else if col.key === 'issueDate'}
			{formatDate(p.issueDate)}
		{:else if col.key === 'total'}
			{formatIdr(p.total)}
		{:else if col.key === 'status'}
			<Badge variant={p.status === 'DRAFT' ? 'outline' : 'default'}>{STATUS_LABELS[p.status]}</Badge>
		{/if}
	{/snippet}
</DataTable>
