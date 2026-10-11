<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch } from '$lib/api-client';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';

	let { data } = $props();
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
		<Alert.Root><Alert.Title>Saldo awal berbeda</Alert.Title><Alert.Description>{upload.balanceWarning}</Alert.Description></Alert.Root>
	{/if}
	{#if upload.aiStatus === 'unavailable'}
		<Alert.Root><Alert.Title>AI tidak tersedia</Alert.Title><Alert.Description>Transaksi yang tidak cocok dengan rule perlu dikategorikan manual di halaman Review.</Alert.Description></Alert.Root>
	{:else if upload.aiStatus === 'partial'}
		<Alert.Root><Alert.Description>Sebagian saran AI gagal dibuat; transaksi tersebut perlu dikategorikan manual.</Alert.Description></Alert.Root>
	{/if}
	{#if upload.status === 'error'}
		<Alert.Root variant="destructive"><Alert.Title>Pemrosesan gagal</Alert.Title><Alert.Description>{upload.errorMessage}</Alert.Description></Alert.Root>
	{/if}
	<p class="text-sm text-slate-600">
		Saldo awal Rp {formatIdr(upload.openingBalance)} · Saldo akhir Rp {formatIdr(upload.closingBalance)}
	</p>
</div>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Tanggal</Table.Head>
			<Table.Head>Keterangan</Table.Head>
			<Table.Head class="text-right">Debit</Table.Head>
			<Table.Head class="text-right">Kredit</Table.Head>
			<Table.Head>Akun</Table.Head>
			<Table.Head>Status</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.transactions as t (t.id)}
			<Table.Row>
				<Table.Cell class="whitespace-nowrap">{formatDate(t.txnDate)}</Table.Cell>
				<Table.Cell class="max-w-md">{t.description}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{t.debit !== '0.00' ? formatIdr(t.debit) : ''}</Table.Cell>
				<Table.Cell class="text-right tabular-nums">{t.credit !== '0.00' ? formatIdr(t.credit) : ''}</Table.Cell>
				<Table.Cell>
					{#if t.accountCode}
						{t.accountCode} {t.accountName}
					{:else if t.suggestedCode}
						<span class="text-slate-500">Saran: {t.suggestedCode} {t.suggestedName}</span>
					{:else}
						<span class="text-slate-400">—</span>
					{/if}
				</Table.Cell>
				<Table.Cell class="space-x-1">
					{#if t.journalId}<Badge>Dijurnal</Badge>{:else if t.isConfirmed}<Badge variant="secondary">{t.source}</Badge>{:else}<Badge variant="outline">Menunggu</Badge>{/if}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
