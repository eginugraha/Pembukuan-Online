<script lang="ts">
	import { notesHtml } from '$lib/rich-text';
	import SignerPdfButton from '$lib/components/SignerPdfButton.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import DeleteDocumentDialog from '$lib/components/DeleteDocumentDialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import QuotationStatusBadge from '$lib/components/QuotationStatusBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/dates';
	import { formatAmount } from '$lib/currency';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();

	const q = $derived(data.quotation);
	// Tombol tulis hanya untuk versi terbaru; versi lama di riwayat hanya bisa dilihat dan diunduh.
	const canWrite = $derived(roleAtLeast(data.ctx.role, 'accountant') && q.isLatest);
	const isApproved = $derived(q.status === 'approved');
	let deleteOpen = $state(false);
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function run(action: () => Promise<unknown>) {
		error = null;
		busy = true;
		try {
			await action();
		} catch (err) {
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}

	const approve = () => run(async () => { await apiFetch(`/api/invoicing/quotations/${q.id}/approval`, { method: 'POST' }); await invalidateAll(); });
	const unapprove = () => run(async () => { await apiFetch(`/api/invoicing/quotations/${q.id}/approval`, { method: 'DELETE' }); await invalidateAll(); });
	const doDelete = () =>
		run(async () => {
			deleteOpen = false;
			await apiFetch(`/api/invoicing/quotations/${q.id}`, { method: 'DELETE' });
			// Bila ada versi sebelumnya, ia kembali menjadi versi terbaru.
			const previous = q.history.find((h) => h.id !== q.id);
			await goto(previous ? `/invoicing/quotations/${previous.id}` : '/invoicing/quotations');
		});
</script>

<PageHeader title={q.quotationNo} description={data.contact.name} crumb={q.quotationNo}>
	{#snippet actions()}
		<SignerPdfButton label="Unduh PDF" href="/api/invoicing/quotations/{q.id}/pdf" signers={data.signers} lastSignerId={q.lastSignerId} />
		{#if canWrite && !isApproved}
			<Button variant="outline" disabled={busy} onclick={approve}>Tandai Disetujui</Button>
			<Button variant="outline" href="/invoicing/quotations/{q.id}/revise">Buat Revisi</Button>
			<Button variant="outline" href="/invoicing/quotations/{q.id}/edit">Ubah</Button>
			<Button variant="outline" onclick={() => (deleteOpen = true)}>Hapus</Button>
		{/if}
		{#if canWrite && isApproved}
			<Button variant="outline" disabled={busy} onclick={unapprove}>Batalkan persetujuan</Button>
		{/if}
	{/snippet}
</PageHeader>
{#if error}<p role="alert" class="mb-4 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{error}</p>{/if}

<Card.Root class="mb-6">
	<Card.Content class="grid gap-4 pt-6 text-sm sm:grid-cols-5">
		<div>
			<p class="text-muted-foreground">Status</p>
			<p class="mt-0.5"><QuotationStatusBadge status={q.status} /></p>
		</div>
		<div>
			<p class="text-muted-foreground">Tanggal penawaran</p>
			<p class="font-medium">{formatDate(q.issueDate)}</p>
		</div>
		<div>
			<p class="text-muted-foreground">Berlaku sampai</p>
			<p class="font-medium">{q.validUntil ? formatDate(q.validUntil) : '–'}</p>
		</div>
		<div>
			<p class="text-muted-foreground">Pelanggan</p>
			<p class="font-medium">{data.contact.name}</p>
			{#if data.contact.attention}
				<p class="text-xs text-muted-foreground">Attn: {[data.contact.attention, data.contact.position].filter(Boolean).join(', ')}</p>
			{/if}
		</div>
		<div>
			<p class="text-muted-foreground">Total</p>
			<p class="font-medium tabular-nums">{formatAmount(q.total, q.currency)}</p>
		</div>
	</Card.Content>
</Card.Root>

{#if q.subject}
	<p class="mb-4 text-sm"><span class="text-muted-foreground">Perihal:</span> <span class="font-medium">{q.subject}</span></p>
{/if}

<div class="panel px-2 py-1">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Keterangan</Table.Head>
				<Table.Head class="w-28 text-right">Kuantitas</Table.Head>
				<Table.Head class="w-40 text-right">Harga satuan</Table.Head>
				<Table.Head class="w-32 text-right">Jumlah</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each q.lines as line (line.id)}
				<Table.Row>
					<Table.Cell>{line.description}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{line.quantity}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatAmount(line.unitPrice, q.currency)}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatAmount(line.amount, q.currency)}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>

<div class="mt-4 flex flex-col items-end gap-1 text-sm">
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">Subtotal</span><span class="tabular-nums">{formatAmount(q.subtotal, q.currency)}</span></div>
	{#if Number(q.discount) > 0}
		<div class="flex w-64 justify-between"><span class="text-muted-foreground">Diskon</span><span class="tabular-nums">-{formatAmount(q.discount, q.currency)}</span></div>
	{/if}
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">PPN</span><span class="tabular-nums">{formatAmount(q.taxAmount, q.currency)}</span></div>
	<div class="flex w-64 justify-between font-semibold"><span>Total</span><span class="tabular-nums">{formatAmount(q.total, q.currency)}</span></div>
</div>

{#if q.notes}
	<div class="rich-notes mt-4 text-sm text-muted-foreground">{@html notesHtml(q.notes)}</div>
{/if}

{#if q.history.length > 1}
	<section aria-label="Riwayat revisi" class="mt-8">
		<h2 class="mb-2 text-sm font-semibold">Riwayat revisi</h2>
		<div class="panel px-2 py-1">
			<Table.Root>
				<Table.Body>
					{#each q.history as h (h.id)}
						<Table.Row class={h.id === q.id ? 'bg-pale' : ''}>
							<Table.Cell>
								{#if h.id === q.id}
									<span class="font-medium" aria-current="page">{h.quotationNo}</span>
								{:else}
									<a class="text-green underline-offset-4 hover:underline" href="/invoicing/quotations/{h.id}">{h.quotationNo}</a>
								{/if}
							</Table.Cell>
							<Table.Cell>{formatDate(h.issueDate)}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{formatAmount(h.total, h.currency)}</Table.Cell>
							<Table.Cell class="w-32 text-right"><QuotationStatusBadge status={h.status} /></Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</section>
{/if}

<DeleteDocumentDialog bind:open={deleteOpen} title="Hapus penawaran" name={q.quotationNo} {busy} onconfirm={doDelete} />
