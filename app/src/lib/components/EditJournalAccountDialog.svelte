<script lang="ts">
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import FormField from '$lib/components/FormField.svelte';
	import SearchSelect, { type SearchOption } from '$lib/components/SearchSelect.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let {
		open = $bindable(false),
		entry,
		options,
		onsaved
	}: {
		open: boolean;
		entry: { id: string; refNo: string | null; description: string | null; accountId: string; accountLabel: string } | null;
		options: SearchOption[];
		onsaved: () => void;
	} = $props();

	let accountId = $state('');
	let error = $state<string | null>(null); // error milik field akun yang dipilih
	let generalError = $state<string | null>(null); // error lain (mis. jurnal tidak bisa diubah)
	let busy = $state(false);

	$effect(() => {
		if (open) {
			accountId = entry?.accountId ?? '';
			error = null;
			generalError = null;
		}
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!entry) return;
		error = generalError = null;
		if (!accountId) {
			error = 'Akun wajib dipilih';
			return;
		}
		busy = true;
		try {
			await apiFetch(`/api/journal/${entry.id}/account`, { method: 'PATCH', json: { accountId } });
			open = false;
			onsaved();
		} catch (err) {
			if (err instanceof ClientApiError && err.fields.accountId) error = err.fields.accountId;
			else generalError = err instanceof Error ? err.message : 'Gagal menyimpan';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Ubah akun jurnal</Dialog.Title>
			<Dialog.Description>
				{entry?.refNo ?? ''} · {entry?.description ?? ''}<br />
				Akun saat ini: <strong>{entry?.accountLabel}</strong>. Tanggal, nominal, dan akun bank tidak berubah.
			</Dialog.Description>
		</Dialog.Header>
		<form class="space-y-4" onsubmit={save} novalidate>
			<FormField id="je-account" label="Akun baru" error={error ?? undefined}>
				<SearchSelect
					id="je-account"
					bind:value={accountId}
					{options}
					placeholder="Pilih akun…"
					searchPlaceholder="Cari kode atau nama akun…"
					emptyText="Tidak ada akun yang cocok"
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? 'je-account-error' : undefined}
				/>
			</FormField>
			{#if generalError}<p role="alert" class="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{generalError}</p>{/if}
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Batal</Button>
				<Button type="submit" disabled={busy}>Simpan</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
