<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import FileText from '@lucide/svelte/icons/file-text';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import { fieldErrors } from '$lib/forms/validation';
	import { ManualEntryInput } from '$lib/schemas/upload';
	import FormField from '$lib/components/FormField.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import { inputClass } from '$lib/ui';

	const MAX_BYTES = 10 * 1024 * 1024;

	let file = $state<File | null>(null);
	let dragging = $state(false);
	let busy = $state(false);
	let errorMessage = $state<string | null>(null);
	let fileError = $state<string | null>(null);

	function pick(files: FileList | null | undefined) {
		errorMessage = null;
		const f = files?.[0] ?? null;
		// Cek cepat di browser; server tetap memvalidasi isi file.
		fileError = !f ? null : !f.name.toLowerCase().endsWith('.pdf') ? 'File harus berformat PDF' : f.size > MAX_BYTES ? 'Ukuran file maksimal 10 MB' : null;
		file = fileError ? null : f;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!file) {
			fileError ??= 'Pilih file PDF terlebih dahulu';
			return;
		}
		busy = true;
		errorMessage = fileError = null;
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await apiFetch<{ id: string }>('/api/uploads', { method: 'POST', body });
			await goto(`/uploads/${res.id}`);
		} catch (err) {
			if (err instanceof ClientApiError && err.fields.file) fileError = err.fields.file;
			else errorMessage = err instanceof Error ? err.message : 'Upload gagal';
		} finally {
			busy = false;
		}
	}

	// --- Input manual ---

	type ManualRow = { date: string; description: string; direction: 'DB' | 'CR'; amount: string };

	let activeTab = $state<'pdf' | 'manual'>('pdf');
	let manualBank = $state('');
	let manualAccountNo = $state('');
	let manualOpeningBalance = $state('');
	let manualRows = $state<ManualRow[]>([{ date: '', description: '', direction: 'DB', amount: '' }]);
	let manualErrorMessage = $state<string | null>(null);
	let manualBusy = $state(false);

	function addManualRow() {
		manualRows = [...manualRows, { date: '', description: '', direction: 'DB', amount: '' }];
	}
	function removeManualRow(i: number) {
		manualRows = manualRows.filter((_, idx) => idx !== i);
	}

	const manualErrors = $derived(
		fieldErrors(ManualEntryInput, {
			bank: manualBank,
			accountNo: manualAccountNo,
			openingBalance: manualOpeningBalance || undefined,
			rows: manualRows
		})
	);

	async function submitManual(e: SubmitEvent) {
		e.preventDefault();
		manualErrorMessage = null;
		if (Object.keys(manualErrors).length > 0) {
			manualErrorMessage = Object.values(manualErrors)[0];
			return;
		}
		manualBusy = true;
		try {
			const res = await apiFetch<{ id: string }>('/api/uploads/manual', {
				method: 'POST',
				json: { bank: manualBank, accountNo: manualAccountNo, openingBalance: manualOpeningBalance || undefined, rows: manualRows }
			});
			await goto(`/uploads/${res.id}`);
		} catch (err) {
			manualErrorMessage = err instanceof ClientApiError ? err.message : err instanceof Error ? err.message : 'Gagal menyimpan';
		} finally {
			manualBusy = false;
		}
	}
</script>

<PageHeader title="Upload eStatement" description="Unggah eStatement BCA (PDF), atau masukkan transaksi secara manual." />

<div class="mb-4 flex gap-2" role="tablist">
	<Button variant={activeTab === 'pdf' ? 'default' : 'outline'} onclick={() => (activeTab = 'pdf')} role="tab" aria-selected={activeTab === 'pdf'}>Upload PDF</Button>
	<Button variant={activeTab === 'manual' ? 'default' : 'outline'} onclick={() => (activeTab = 'manual')} role="tab" aria-selected={activeTab === 'manual'}>Input Manual</Button>
</div>

{#if activeTab === 'pdf'}
	<Card.Root class="max-w-xl">
		<Card.Content class="pt-6">
			<form class="space-y-4" onsubmit={submit}>
				<label
					class="flex cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed p-10 text-center transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-green/40 {fileError ? 'border-destructive/60' : dragging ? 'border-green bg-pale' : 'border-green/35 bg-surface-soft hover:border-green/60 hover:bg-pale/50'}"
					ondragover={(e) => {
						e.preventDefault();
						dragging = true;
					}}
					ondragleave={() => (dragging = false)}
					ondrop={(e) => {
						e.preventDefault();
						dragging = false;
						pick(e.dataTransfer?.files);
					}}
				>
					<span class="icon-tile icon-tile-solid mb-4 size-16 rounded-2xl">
						{#if file}<FileText class="size-7" />{:else}<UploadIcon class="size-7" />{/if}
					</span>
					<span class="font-semibold break-all">{file ? file.name : 'Seret file PDF ke sini atau klik untuk memilih'}</span>
					<span class="mt-1 text-xs text-muted-foreground">Maksimal 10 MB</span>
					<input type="file" accept="application/pdf,.pdf" class="sr-only" aria-invalid={fileError ? 'true' : undefined} aria-describedby={fileError ? 'file-error' : undefined} onchange={(e) => {
							pick(e.currentTarget.files);
							// Kosongkan input agar memilih ulang file yang sama (mis. setelah ditolak) tetap memicu pengecekan.
							e.currentTarget.value = '';
						}} />
				</label>
				{#if fileError}<p id="file-error" role="alert" class="flex items-center gap-1.5 text-sm font-medium text-destructive"><CircleAlert class="size-4" aria-hidden="true" />{fileError}</p>{/if}
				{#if errorMessage}
					<Alert.Root variant="destructive">
						<Alert.Title>Upload gagal</Alert.Title>
						<Alert.Description>{errorMessage}</Alert.Description>
					</Alert.Root>
				{/if}
				<Button type="submit" disabled={busy}>{busy ? 'Memproses…' : 'Unggah'}</Button>
			</form>
		</Card.Content>
	</Card.Root>
{/if}

{#if activeTab === 'manual'}
	<Card.Root class="max-w-4xl">
		<Card.Content class="pt-6">
			<form class="space-y-4" onsubmit={submitManual}>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<FormField id="manual-bank" label="Nama bank">
						<input id="manual-bank" class={inputClass} bind:value={manualBank} />
					</FormField>
					<FormField id="manual-account-no" label="Nomor rekening">
						<input id="manual-account-no" class={inputClass} bind:value={manualAccountNo} />
					</FormField>
					<FormField id="manual-opening-balance" label="Saldo awal (opsional)">
						<input id="manual-opening-balance" class="{inputClass} text-right" inputmode="decimal" placeholder="0" bind:value={manualOpeningBalance} />
					</FormField>
				</div>

				<div class="panel px-2 py-1">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Tanggal</Table.Head>
								<Table.Head>Keterangan</Table.Head>
								<Table.Head>Arah</Table.Head>
								<Table.Head class="w-40 text-right">Jumlah</Table.Head>
								<Table.Head class="w-10"></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each manualRows as row, i (i)}
								<Table.Row>
									<Table.Cell class="align-top">
										<DateField bind:value={row.date} aria-label="Tanggal" />
									</Table.Cell>
									<Table.Cell class="align-top">
										<input class={inputClass} aria-label="Keterangan" bind:value={row.description} />
									</Table.Cell>
									<Table.Cell class="align-top">
										<div class="flex flex-col gap-1 text-sm whitespace-nowrap">
											<label class="inline-flex items-center gap-1.5">
												<input type="radio" name="manual-direction-{i}" value="DB" bind:group={row.direction} />
												Keluar (Debit)
											</label>
											<label class="inline-flex items-center gap-1.5">
												<input type="radio" name="manual-direction-{i}" value="CR" bind:group={row.direction} />
												Masuk (Kredit)
											</label>
										</div>
									</Table.Cell>
									<Table.Cell class="align-top">
										<input class="{inputClass} text-right" inputmode="decimal" placeholder="0" aria-label="Jumlah" bind:value={row.amount} />
									</Table.Cell>
									<Table.Cell class="align-top">
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											aria-label="Hapus baris {i + 1}"
											disabled={manualRows.length === 1}
											onclick={() => removeManualRow(i)}
										>
											<Trash2 class="size-4" />
										</Button>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>

				<Button type="button" variant="outline" onclick={addManualRow}>Tambah Baris</Button>

				{#if manualErrorMessage}
					<Alert.Root variant="destructive">
						<Alert.Title>Gagal menyimpan</Alert.Title>
						<Alert.Description>{manualErrorMessage}</Alert.Description>
					</Alert.Root>
				{/if}

				<Button type="submit" disabled={manualBusy}>{manualBusy ? 'Menyimpan…' : 'Simpan'}</Button>
			</form>
		</Card.Content>
	</Card.Root>
{/if}
