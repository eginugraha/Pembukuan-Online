<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import DataTable from '$lib/components/DataTable.svelte';
	import DeleteDocumentDialog from '$lib/components/DeleteDocumentDialog.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import type { Column } from '$lib/table';
	import { apiFetch } from '$lib/api-client';
	import { formatAmount } from '$lib/currency';
	import { isZero } from '$lib/money';
	import { cn } from '$lib/utils';

	let { data } = $props();
	type Entry = (typeof data.entries)[number];

	const docLabel = $derived(data.tab === 'ap' ? 'PO' : 'Invoice');
	const kindLabel = $derived(data.tab === 'ap' ? 'AP' : 'AR');
	const STATUS_LABEL = { UNPAID: 'Belum lunas', PARTIAL: 'Sebagian', PAID: 'Lunas' } as const;
	const STATUS_VARIANT = { UNPAID: 'warning', PARTIAL: 'muted', PAID: 'success' } as const;
	const STATUS_OPTIONS = [
		{ value: 'ALL', label: 'Semua' },
		{ value: 'UNPAID', label: 'Belum lunas' },
		{ value: 'PARTIAL', label: 'Sebagian' },
		{ value: 'PAID', label: 'Lunas' }
	];

	function docText(e: Entry) {
		return e.hasTerms ? `${e.documentCount} dari ${e.termCount} ${docLabel.toLowerCase()}` : (e.singleDocumentNo ?? '—');
	}

	const COLUMNS = $derived<Column<Entry>[]>([
		{ key: 'title', label: 'Judul', sortable: true, searchable: true, text: (e) => e.title },
		{ key: 'contactName', label: 'Pihak', sortable: true, searchable: true, text: (e) => e.contactName },
		{ key: 'total', label: 'Total', align: 'right', sortable: true, sortValue: (e) => Number(e.total), text: (e) => formatAmount(e.total, e.currency) },
		{ key: 'paid', label: 'Terbayar', align: 'right', sortable: true, sortValue: (e) => Number(e.paidAmount), text: (e) => formatAmount(e.paidAmount, e.currency) },
		{ key: 'remaining', label: 'Sisa', align: 'right', sortable: true, sortValue: (e) => Number(e.remainingAmount), text: (e) => formatAmount(e.remainingAmount, e.currency) },
		{ key: 'status', label: 'Status', text: (e) => STATUS_LABEL[e.status] },
		{ key: 'document', label: docLabel, searchable: true, text: docText },
		{ key: 'actions', label: 'Aksi' }
	]);

	let statusFilter = $state('ALL');
	const rows = $derived(statusFilter === 'ALL' ? data.entries : data.entries.filter((e) => e.status === statusFilter));

	const s = $derived(data.summary);
	const showUsd = $derived([s.ar.USD, s.ap.USD, s.net.USD].some((v) => !isZero(v)));

	let deleting = $state<Entry | null>(null);
	let deleteOpen = $state(false);
	let busy = $state(false);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function confirmDelete() {
		if (!deleting) return;
		message = errorMessage = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/ar-ap/${deleting.id}`, { method: 'DELETE' });
			deleteOpen = false;
			message = `${kindLabel} dihapus.`;
			await invalidateAll();
		} catch (err) {
			deleteOpen = false;
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

{#snippet card(label: string, lines: { text: string; note?: string }[])}
	<div class="min-w-0 rounded-lg border bg-card p-4">
		<p class="text-sm text-muted-foreground">{label}</p>
		{#each lines as l (l.text)}
			<p class="mt-1 truncate text-lg font-semibold tabular-nums text-ink">
				{l.text}{#if l.note} <span class="text-xs font-normal text-muted-foreground">{l.note}</span>{/if}
			</p>
		{/each}
	</div>
{/snippet}

<PageHeader title="Piutang & Hutang" description="Pantau piutang (AR) dan hutang (AP) beserta termin pembayarannya.">
	{#snippet actions()}
		{#if data.canWrite}<Button href="/invoicing/ar-ap/new?kind={kindLabel}">Buat {kindLabel}</Button>{/if}
	{/snippet}
</PageHeader>

<div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	{@render card('Total Piutang', [{ text: formatAmount(s.ar.IDR, 'IDR') }, ...(showUsd ? [{ text: formatAmount(s.ar.USD, 'USD') }] : [])])}
	{@render card('Total Hutang', [{ text: formatAmount(s.ap.IDR, 'IDR') }, ...(showUsd ? [{ text: formatAmount(s.ap.USD, 'USD') }] : [])])}
	{@render card('Balance Perusahaan', [{ text: s.bank ? formatAmount(s.bank.balance, 'IDR') : '—' }])}
	{@render card('Posisi Bersih', [{ text: formatAmount(s.net.IDR, 'IDR'), note: s.bank ? undefined : 'tanpa balance' }, ...(showUsd ? [{ text: formatAmount(s.net.USD, 'USD'), note: 'tanpa balance' }] : [])])}
</div>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<nav class="inline-flex rounded-lg border p-1 text-sm" aria-label="Jenis">
		{#each [{ tab: 'ar', label: 'AR (Piutang)' }, { tab: 'ap', label: 'AP (Hutang)' }] as t (t.tab)}
			<a
				href="?tab={t.tab}"
				aria-current={data.tab === t.tab ? 'page' : undefined}
				class={cn('rounded-md px-3 py-1.5 font-medium', data.tab === t.tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-ink')}
			>{t.label}</a>
		{/each}
	</nav>
	<div class="flex items-center gap-2 text-sm">
		<span class="text-muted-foreground">Status</span>
		<SimpleSelect bind:value={statusFilter} options={STATUS_OPTIONS} class="w-40" />
	</div>
</div>

{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<DataTable {rows} columns={COLUMNS} rowKey={(e) => e.id} searchPlaceholder="Cari judul atau pihak…" emptyText="Belum ada {kindLabel}. Buat {kindLabel} pertama untuk mulai memantau {data.tab === 'ap' ? 'hutang' : 'piutang'}.">
	{#snippet cell(e, col)}
		{#if col.key === 'title'}
			{e.title}
		{:else if col.key === 'contactName'}
			{e.contactName}
		{:else if col.key === 'total'}
			{formatAmount(e.total, e.currency)}
		{:else if col.key === 'paid'}
			{formatAmount(e.paidAmount, e.currency)}
		{:else if col.key === 'remaining'}
			{formatAmount(e.remainingAmount, e.currency)}
		{:else if col.key === 'status'}
			<Badge variant={STATUS_VARIANT[e.status]}>{STATUS_LABEL[e.status]}</Badge>
		{:else if col.key === 'document'}
			<span class="inline-flex items-center gap-1">
				{docText(e)}
				{#if e.currencyMismatch}
					<span title="Mata uang berbeda dengan dokumen" class="text-amber-600"><TriangleAlert class="size-4" aria-label="Mata uang berbeda dengan dokumen" /></span>
				{/if}
			</span>
		{:else if col.key === 'actions'}
			<span class="flex gap-1">
				<Button size="sm" variant="ghost" href="/invoicing/ar-ap/{e.id}">Detail</Button>
				{#if data.canWrite}
					<Button size="sm" variant="ghost" href="/invoicing/ar-ap/{e.id}/edit">Ubah</Button>
					<Button size="sm" variant="ghost" onclick={() => { deleting = e; deleteOpen = true; }}>Hapus</Button>
				{/if}
			</span>
		{/if}
	{/snippet}
</DataTable>

<DeleteDocumentDialog
	bind:open={deleteOpen}
	title="Hapus {kindLabel}"
	name={deleting?.title ?? ''}
	note="{docLabel} yang tertaut tidak ikut terhapus."
	{busy}
	onconfirm={confirmDelete}
/>
