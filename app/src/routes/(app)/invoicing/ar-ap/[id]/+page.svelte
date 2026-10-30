<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { goto, invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DeleteDocumentDialog from '$lib/components/DeleteDocumentDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import { formatAmount } from '$lib/currency';

	let { data } = $props();
	const entry = $derived(data.entry);
	type Term = (typeof data.entry.terms)[number];

	const isAr = $derived(entry.kind === 'AR');
	const kindLabel = $derived(isAr ? 'Piutang (AR)' : 'Hutang (AP)');
	const docLabel = $derived(isAr ? 'Invoice' : 'PO');
	const docPage = $derived(isAr ? '/invoicing/invoices' : '/invoicing/purchase-orders');
	const STATUS_LABEL = { UNPAID: 'Belum lunas', PARTIAL: 'Sebagian', PAID: 'Lunas' } as const;
	const STATUS_VARIANT = { UNPAID: 'warning', PARTIAL: 'muted', PAID: 'success' } as const;

	let error = $state<string | null>(null);
	let busy = $state(false);
	let toggling = $state<string | null>(null);
	let deleteOpen = $state(false);

	async function togglePaid(t: Term) {
		error = null;
		toggling = t.id;
		try {
			await apiFetch(`/api/invoicing/ar-ap/${entry.id}/terms/${t.id}`, { method: 'PATCH', json: { paid: !t.paid } });
			await invalidateAll();
		} catch (err) {
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			toggling = null;
		}
	}

	async function doDelete() {
		error = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/ar-ap/${entry.id}`, { method: 'DELETE' });
			deleteOpen = false;
			await goto(`/invoicing/ar-ap?tab=${isAr ? 'ar' : 'ap'}`);
		} catch (err) {
			deleteOpen = false;
			error = err instanceof ClientApiError ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title={entry.title} description="{kindLabel} · {entry.contactName}" crumb={entry.title}>
	{#snippet actions()}
		{#if data.canWrite}
			<Button variant="outline" href="/invoicing/ar-ap/{entry.id}/edit">Ubah</Button>
			<Button variant="outline" onclick={() => (deleteOpen = true)}>Hapus</Button>
		{/if}
	{/snippet}
</PageHeader>
{#if error}<p role="alert" class="mb-4 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{error}</p>{/if}

<Card.Root class="mb-6">
	<Card.Content class="grid gap-4 pt-6 text-sm sm:grid-cols-4">
		<div>
			<p class="text-muted-foreground">Jenis</p>
			<p class="font-medium">{kindLabel}</p>
		</div>
		<div>
			<p class="text-muted-foreground">{isAr ? 'Pelanggan' : 'Pemasok'}</p>
			<p class="font-medium">{entry.contactName}</p>
		</div>
		<div>
			<p class="text-muted-foreground">Total</p>
			<p class="font-medium tabular-nums">{formatAmount(entry.total, entry.currency)}</p>
		</div>
		<div>
			<p class="text-muted-foreground">Status</p>
			<Badge variant={STATUS_VARIANT[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
		</div>
	</Card.Content>
</Card.Root>

<div class="panel mb-4 px-2 py-1">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				{#if entry.hasTerms}
					<Table.Head>Termin</Table.Head>
					<Table.Head class="text-right">%</Table.Head>
				{/if}
				<Table.Head class="text-right">Nominal</Table.Head>
				<Table.Head>Status</Table.Head>
				<Table.Head>{docLabel}</Table.Head>
				<Table.Head class="text-right">Aksi</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each entry.terms as t (t.id)}
				<Table.Row>
					{#if entry.hasTerms}
						<Table.Cell>{t.name ?? `Termin ${t.termNo}`}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{t.percent}</Table.Cell>
					{/if}
					<Table.Cell class="text-right tabular-nums">{formatAmount(t.amount, entry.currency)}</Table.Cell>
					<Table.Cell>
						{#if data.canWrite}
							<Button
								size="sm"
								variant="outline"
								disabled={toggling !== null}
								aria-pressed={t.paid}
								title={t.paid ? 'Tandai belum lunas' : 'Tandai lunas'}
								onclick={() => togglePaid(t)}
							>
								<Badge variant={t.paid ? 'success' : 'warning'}>{t.paid ? 'Lunas' : 'Belum lunas'}</Badge>
							</Button>
						{:else}
							<Badge variant={t.paid ? 'success' : 'warning'}>{t.paid ? 'Lunas' : 'Belum lunas'}</Badge>
						{/if}
					</Table.Cell>
					<Table.Cell>
						{#if t.document}
							<span class="inline-flex items-center gap-1">
								{t.document.no}
								{#if t.currencyMismatch}
									<span title="Mata uang berbeda dengan dokumen ({t.document.currency})" class="text-amber-600"><TriangleAlert class="size-4" aria-label="Mata uang berbeda dengan dokumen" /></span>
								{/if}
							</span>
						{:else}
							<span class="text-muted-foreground">—</span>
						{/if}
					</Table.Cell>
					<Table.Cell class="text-right">
						{#if t.document}
							<Button size="sm" variant="ghost" href="{docPage}/{t.document.id}">Detail {docLabel}</Button>
						{:else if data.canWrite}
							<Button size="sm" variant="ghost" href="{docPage}/new?termId={t.id}">Buat {docLabel}</Button>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>

<div class="flex flex-col items-end gap-1 text-sm">
	<div class="flex w-64 justify-between"><span class="text-muted-foreground">Terbayar</span><span class="tabular-nums">{formatAmount(entry.paidAmount, entry.currency)}</span></div>
	<div class="flex w-64 justify-between font-semibold"><span>Sisa</span><span class="tabular-nums">{formatAmount(entry.remainingAmount, entry.currency)}</span></div>
</div>

<DeleteDocumentDialog
	bind:open={deleteOpen}
	title="Hapus {isAr ? 'AR' : 'AP'}"
	name={entry.title}
	note="{docLabel} yang tertaut tidak ikut terhapus."
	{busy}
	onconfirm={doDelete}
/>
