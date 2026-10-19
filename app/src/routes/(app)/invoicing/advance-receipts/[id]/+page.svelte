<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();

	const STATUS_LABELS = { ACTIVE: 'Aktif', APPLIED: 'Terpakai', REFUNDED: 'Dibatalkan' } as const;
	const canCancel = $derived(data.advanceReceipt.status === 'ACTIVE' && roleAtLeast(data.ctx.role, 'admin'));

	let cancelOpen = $state(false);
	let error = $state<string | null>(null);
	let busy = $state(false);

	function askCancel() {
		error = null;
		cancelOpen = true;
	}

	async function doCancel() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/advance-receipts/${data.advanceReceipt.id}/cancel`, { method: 'POST', json: {} });
			cancelOpen = false;
			await invalidateAll();
		} catch (err) {
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title={data.advanceReceipt.receiptNo} description={data.contact.name}>
	{#snippet actions()}
		{#if canCancel}<Button variant="outline" onclick={askCancel}>Batalkan</Button>{/if}
	{/snippet}
</PageHeader>

<Card.Root class="mb-6">
	<Card.Content class="grid grid-cols-2 gap-4 pt-6 text-sm sm:grid-cols-4">
		<div>
			<p class="text-muted-foreground">Status</p>
			<Badge variant={data.advanceReceipt.status === 'ACTIVE' ? 'default' : 'outline'}>{STATUS_LABELS[data.advanceReceipt.status]}</Badge>
		</div>
		<div>
			<p class="text-muted-foreground">Tanggal terima</p>
			<p class="font-medium">{formatDate(data.advanceReceipt.receiptDate)}</p>
		</div>
		<div>
			<p class="text-muted-foreground">Pelanggan</p>
			<p class="font-medium">{data.contact.name}</p>
		</div>
		<div>
			<p class="text-muted-foreground">Jumlah</p>
			<p class="font-medium tabular-nums">{formatIdr(data.advanceReceipt.amount)}</p>
		</div>
	</Card.Content>
</Card.Root>

<Dialog.Root bind:open={cancelOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Batalkan uang muka?</Dialog.Title>
			<Dialog.Description>Jurnal yang sudah diposting akan dibalik (Pembalikan) dan uang muka ditandai Dibatalkan.</Dialog.Description>
		</Dialog.Header>
		{#if error}<p role="alert" class="text-sm font-medium text-destructive">{error}</p>{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (cancelOpen = false)}>Batal</Button>
			<Button type="button" variant="destructive" disabled={busy} onclick={doCancel}>{busy ? 'Memproses…' : 'Batalkan'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
