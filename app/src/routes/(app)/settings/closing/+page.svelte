<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { accountOptions } from '$lib/account-options';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import FormField from '$lib/components/FormField.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { formatDate, todayIso } from '$lib/dates';
	import { formatAccounting } from '$lib/money';
	import { formatPeriod } from '$lib/periods';

	let { data } = $props();
	type Year = (typeof data.years)[number];

	const options = $derived(accountOptions(data.equityAccounts));
	let message = $state<string | null>(null);

	let closeOpen = $state(false);
	let reopenOpen = $state(false);
	let target = $state<Year | null>(null);
	let retainedId = $state('');
	let error = $state<string | null>(null);
	let fieldError = $state<string | null>(null);
	let busy = $state(false);

	function askClose(y: Year) {
		target = y;
		retainedId = data.defaultRetainedEarningsId ?? '';
		error = fieldError = null;
		closeOpen = true;
	}
	function askReopen(y: Year) {
		target = y;
		error = null;
		reopenOpen = true;
	}

	async function submit(fn: () => Promise<string>, close: () => void) {
		error = fieldError = message = null;
		busy = true;
		try {
			const msg = await fn();
			close();
			message = msg;
		} catch (err) {
			if (err instanceof ClientApiError) {
				fieldError = err.fields.retainedEarningsAccountId ?? null;
				error = fieldError ? null : err.message;
			} else error = 'Terjadi kesalahan';
			return;
		} finally {
			busy = false;
		}
		// Segarkan daftar di luar try: kegagalan muat ulang tidak boleh menyembunyikan pesan sukses.
		await invalidateAll().catch(() => {});
	}

	const doClose = () =>
		submit(
			async () => {
				await apiFetch('/api/closings', { method: 'POST', json: { periodStart: target!.periodStart, retainedEarningsAccountId: retainedId } });
				return `Tahun buku ${target!.label} ditutup.`;
			},
			() => (closeOpen = false)
		);
	const doReopen = () =>
		submit(
			async () => {
				await apiFetch(`/api/closings/${target!.periodStart}`, { method: 'DELETE' });
				return `Tahun buku ${target!.label} dibuka kembali.`;
			},
			() => (reopenOpen = false)
		);
</script>

<PageHeader title="Tutup Buku" description="Tutup tahun buku yang sudah selesai agar jurnalnya terkunci." />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}

{#if data.years.length === 0}
	<p class="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">Belum ada transaksi yang dijurnal.</p>
{:else}
	<div class="overflow-x-auto rounded-xl border border-border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50 text-left text-xs text-muted-foreground">
				<tr>
					<th class="px-4 py-2.5 font-medium">Periode</th>
					<th class="px-4 py-2.5 font-medium">Status</th>
					<th class="px-4 py-2.5 text-right font-medium">Laba bersih</th>
					<th class="px-4 py-2.5 font-medium">Ditutup</th>
					<th class="px-4 py-2.5"><span class="sr-only">Aksi</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.years as y (y.periodStart)}
					<tr class="border-t border-border">
						<td class="px-4 py-2.5">{formatPeriod(y.periodStart, y.periodEnd)}</td>
						<td class="px-4 py-2.5"><Badge variant={y.status === 'closed' ? 'success' : 'warning'}>{y.status === 'closed' ? 'Ditutup' : 'Terbuka'}</Badge></td>
						<td class="px-4 py-2.5 text-right tabular-nums">{formatAccounting(y.netProfit)}</td>
						<td class="px-4 py-2.5">{y.closedAt ? `${formatDate(todayIso(new Date(y.closedAt)))}${y.closedByName ? ` · ${y.closedByName}` : ''}` : '—'}</td>
						<td class="px-4 py-2.5 text-right">
							{#if y.canClose}<Button size="sm" onclick={() => askClose(y)}>Tutup Buku</Button>{/if}
							{#if y.canReopen}<Button size="sm" variant="outline" onclick={() => askReopen(y)}>Buka Kembali</Button>{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<Dialog.Root bind:open={closeOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Tutup tahun buku {target?.label}?</Dialog.Title>
			<Dialog.Description>
				Laba bersih {target ? formatAccounting(target.netProfit) : ''} akan dipindahkan ke akun laba ditahan, dan jurnal tahun ini dikunci.
			</Dialog.Description>
		</Dialog.Header>
		<FormField id="cl-re" label="Akun laba ditahan" error={fieldError ?? undefined}>
			<SearchSelect
				id="cl-re"
				bind:value={retainedId}
				{options}
				placeholder="Pilih akun…"
				searchPlaceholder="Cari kode atau nama akun…"
				emptyText="Tidak ada akun ekuitas yang cocok"
				aria-invalid={fieldError ? 'true' : undefined}
				aria-describedby={fieldError ? 'cl-re-error' : undefined}
			/>
		</FormField>
		{#if error}<p role="alert" class="text-sm font-medium text-destructive">{error}</p>{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (closeOpen = false)}>Batal</Button>
			<Button type="button" disabled={busy || !retainedId} onclick={doClose}>Tutup Buku</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={reopenOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Buka kembali tahun buku {target?.label}?</Dialog.Title>
			<Dialog.Description>Jurnal penutup akan dihapus dan jurnal tahun ini bisa diubah lagi.</Dialog.Description>
		</Dialog.Header>
		{#if error}<p role="alert" class="text-sm font-medium text-destructive">{error}</p>{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (reopenOpen = false)}>Batal</Button>
			<Button type="button" variant="destructive" disabled={busy} onclick={doReopen}>Buka Kembali</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
