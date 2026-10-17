<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import DataTable from '$lib/components/DataTable.svelte';
	import { accountSearchText } from '$lib/account-options';
	import type { Column } from '$lib/table';
	import { apiFetch } from '$lib/api-client';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';

	let { data } = $props();
	type Txn = (typeof data.transactions)[number];
	const txnStatus = (t: Txn) => (t.journalId ? 2 : t.isConfirmed ? 1 : 0);
	const TXN_COLUMNS: Column<Txn>[] = [
		{ key: 'date', label: 'Tanggal', sortable: true, sortValue: (t) => `${t.txnDate}-${String(t.lineNo).padStart(5, '0')}` },
		{ key: 'description', label: 'Keterangan', sortable: true, searchable: true, text: (t) => t.description },
		{ key: 'debit', label: 'Debit', sortable: true, align: 'right', sortValue: (t) => Number(t.debit) },
		{ key: 'credit', label: 'Kredit', sortable: true, align: 'right', sortValue: (t) => Number(t.credit) },
		{ key: 'account', label: 'Akun', sortable: true, searchable: true, text: accountSearchText },
		{ key: 'status', label: 'Status', sortable: true, sortValue: txnStatus }
	];
	const upload = $derived(data.upload);
	const unjournaled = $derived(data.transactions.filter((t) => !t.journalId).length);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);
	let confirmDelete = $state(false);

	$effect(() => {
		if (upload.status !== 'processing') return;
		const timer = setInterval(() => invalidateAll(), 2000);
		return () => clearInterval(timer);
	});

	async function run(action: () => Promise<void>) {
		busy = true;
		message = errorMessage = null;
		try {
			await action();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}

	const generate = () =>
		run(async () => {
			const res = await apiFetch<{ created: number }>('/api/journal/generate', { method: 'POST', json: { uploadId: upload.id } });
			message = `${res.created} jurnal dibuat`;
			await invalidateAll();
		});
	const retry = () =>
		run(async () => {
			await apiFetch(`/api/uploads/${upload.id}/categorize`, { method: 'POST' });
			await invalidateAll();
		});
	const remove = () =>
		run(async () => {
			await apiFetch(`/api/uploads/${upload.id}`, { method: 'DELETE' });
			await goto('/uploads');
		});
</script>

<PageHeader title={upload.filename} description="Rekening {upload.accountNo} · {formatDate(upload.periodStart)} – {formatDate(upload.periodEnd)}">
	{#snippet actions()}
		<StatusBadge status={upload.status} />
		{#if data.canWrite && upload.status === 'review'}
			<Button href="/review" variant="outline">Review transaksi</Button>
		{/if}
		{#if data.canWrite && upload.status === 'done' && unjournaled > 0}
			<Button onclick={generate} disabled={busy}>Generate Jurnal</Button>
		{/if}
		{#if data.canWrite && upload.status === 'error'}
			<Button onclick={retry} disabled={busy} variant="outline">Proses ulang</Button>
		{/if}
		{#if data.canDelete}
			{#if confirmDelete}
				<Button variant="destructive" onclick={remove} disabled={busy}>Ya, hapus upload &amp; jurnalnya</Button>
				<Button variant="ghost" onclick={() => (confirmDelete = false)}>Batal</Button>
			{:else}
				<Button variant="ghost" onclick={() => (confirmDelete = true)}>Hapus</Button>
			{/if}
		{/if}
	{/snippet}
</PageHeader>

<div class="mb-4 space-y-3">
	{#if message}<Alert.Root><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
	{#if errorMessage}<Alert.Root variant="destructive"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}
	{#if upload.balanceWarning}
		<Alert.Root class="border-amber-300 bg-amber-50 text-amber-900"><Alert.Title>Saldo awal berbeda</Alert.Title><Alert.Description>{upload.balanceWarning}</Alert.Description></Alert.Root>
	{/if}
	{#if upload.aiStatus === 'unavailable'}
		<Alert.Root><Alert.Title>AI tidak tersedia</Alert.Title><Alert.Description>Transaksi yang tidak cocok dengan rule perlu dikategorikan manual di halaman Review.</Alert.Description></Alert.Root>
	{:else if upload.aiStatus === 'partial'}
		<Alert.Root><Alert.Description>Sebagian saran AI gagal dibuat; transaksi tersebut perlu dikategorikan manual.</Alert.Description></Alert.Root>
	{/if}
	{#if upload.status === 'error'}
		<Alert.Root variant="destructive"><Alert.Title>Pemrosesan gagal</Alert.Title><Alert.Description>{upload.errorMessage}</Alert.Description></Alert.Root>
	{/if}
	<div class="flex flex-wrap gap-3">
		<div class="panel px-4 py-3"><p class="text-xs text-muted-foreground">Saldo awal</p><p class="font-bold tabular-nums">Rp {formatIdr(upload.openingBalance)}</p></div>
		<div class="panel px-4 py-3"><p class="text-xs text-muted-foreground">Saldo akhir</p><p class="font-bold tabular-nums">Rp {formatIdr(upload.closingBalance)}</p></div>
		<div class="panel px-4 py-3"><p class="text-xs text-muted-foreground">Transaksi</p><p class="font-bold tabular-nums">{data.transactions.length}</p></div>
	</div>
</div>

<DataTable rows={data.transactions} columns={TXN_COLUMNS} rowKey={(t) => t.id} searchPlaceholder="Cari keterangan atau akun…">
	{#snippet cell(t, c)}
		{#if c.key === 'date'}{formatDate(t.txnDate)}
		{:else if c.key === 'description'}<span class="block max-w-md min-w-56 whitespace-normal">{t.description}</span>
		{:else if c.key === 'debit'}{t.debit !== '0.00' ? formatIdr(t.debit) : ''}
		{:else if c.key === 'credit'}{t.credit !== '0.00' ? formatIdr(t.credit) : ''}
		{:else if c.key === 'account'}
			{#if t.accountCode}
				{t.accountCode} {t.accountName}
			{:else if t.suggestedCode}
				<span class="text-muted-foreground">Saran: {t.suggestedCode} {t.suggestedName}</span>
			{:else}
				<span class="text-muted-foreground/70">—</span>
			{/if}
		{:else if c.key === 'status'}
			{#if t.journalId}<Badge variant="success">Dijurnal</Badge>{:else if t.isConfirmed}<Badge variant="secondary">{t.source}</Badge>{:else}<Badge variant="warning">Menunggu</Badge>{/if}
		{/if}
	{/snippet}
</DataTable>
