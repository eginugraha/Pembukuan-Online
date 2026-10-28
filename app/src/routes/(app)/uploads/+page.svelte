<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/table';
	import { formatDate } from '$lib/dates';
	import { roleAtLeast } from '$lib/roles';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { page } from '$app/state';

	let { data } = $props();
	type Upload = (typeof data.uploads)[number];
	const STATUS_ORDER = { review: 0, processing: 1, error: 2, done: 3 } as const;
	const UPLOAD_COLUMNS: Column<Upload>[] = [
		{ key: 'filename', label: 'File', sortable: true, searchable: true, text: (u) => u.filename },
		{ key: 'accountNo', label: 'Rekening', sortable: true, searchable: true, text: (u) => u.accountNo },
		{ key: 'period', label: 'Periode', sortable: true, sortValue: (u) => u.periodStart },
		{ key: 'status', label: 'Status', sortable: true, sortValue: (u) => STATUS_ORDER[u.status] },
		{ key: 'pending', label: 'Belum dikonfirmasi', sortable: true, align: 'right', sortValue: (u) => u.pending },
		{ key: 'uploadedAt', label: 'Diunggah', sortable: true, sortValue: (u) => new Date(u.uploadedAt).getTime() },
		{ key: 'preview', label: 'PDF', align: 'right' }
	];
	let previewing = $state<Upload | null>(null);
	const canUpload = $derived(roleAtLeast(page.data.ctx?.role, 'accountant'));
</script>

<PageHeader title="Riwayat Upload" description="Semua eStatement yang pernah diunggah untuk perusahaan ini.">
	{#snippet actions()}
		{#if canUpload}<Button href="/uploads/new">Upload Baru</Button>{/if}
	{/snippet}
</PageHeader>

{#if data.uploads.length === 0}
	<p class="panel p-8 text-center text-muted-foreground">Belum ada eStatement yang diunggah.</p>
{:else}
	<DataTable rows={data.uploads} columns={UPLOAD_COLUMNS} rowKey={(u) => u.id} searchPlaceholder="Cari file atau rekening…">
		{#snippet cell(u, c)}
			{#if c.key === 'filename'}<a class="font-medium text-deep hover:underline" href="/uploads/{u.id}">{u.filename}</a>
			{:else if c.key === 'accountNo'}{u.accountNo}
			{:else if c.key === 'period'}{formatDate(u.periodStart)} – {formatDate(u.periodEnd)}
			{:else if c.key === 'status'}<StatusBadge status={u.status} />
			{:else if c.key === 'pending'}{u.pending} / {u.total}
			{:else if c.key === 'uploadedAt'}{new Date(u.uploadedAt).toLocaleString('id-ID')}
			{:else if c.key === 'preview'}
				{#if u.hasPdf}<Button variant="outline" size="sm" onclick={() => (previewing = u)}>Preview</Button>{:else}<span class="text-muted-foreground">—</span>{/if}
			{/if}
		{/snippet}
	</DataTable>
{/if}

<Dialog.Root open={previewing !== null} onOpenChange={(o) => { if (!o) previewing = null; }}>
	<Dialog.Content class="flex h-[90vh] max-w-5xl flex-col sm:max-w-5xl">
		<Dialog.Header>
			<Dialog.Title>{previewing?.filename}</Dialog.Title>
		</Dialog.Header>
		{#if previewing}
			<iframe title="Preview {previewing.filename}" src="/api/uploads/{previewing.id}/pdf" class="min-h-0 w-full flex-1 rounded border"></iframe>
		{/if}
	</Dialog.Content>
</Dialog.Root>
