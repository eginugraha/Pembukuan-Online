<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { apiFetch } from '$lib/api-client';
	import FormField from '$lib/components/FormField.svelte';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { CreateCompanyInput, UpdateCompanyInput } from '$lib/schemas/company';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import { accountOptions as toAccountOptions } from '$lib/account-options';
	import { COA_TEMPLATES, type CoaTemplateId } from '$lib/coa-templates';
	import LogoCropDialog from '$lib/components/LogoCropDialog.svelte';
	import { AVATAR_ACCEPT, AVATAR_MAX_INPUT_BYTES } from '$lib/image';

	let { data } = $props();
	// Nilai awal form diambil sekali dari data (snapshot), lalu diedit lokal.
	const initialForm = () => ({
		name: data.company.name,
		npwp: data.company.npwp ?? '',
		address: data.company.address ?? '',
		bankAccountId: data.company.bankAccountId ?? ''
	});
	type CompanyForm = ReturnType<typeof initialForm>;
	const toUpdate = (v: CompanyForm) => ({ name: v.name, npwp: v.npwp || null, address: v.address || null, bankAccountId: v.bankAccountId || null });
	const form = new FormState(UpdateCompanyInput, initialForm(), toUpdate);
	const newForm = new FormState(CreateCompanyInput, { name: '', coaTemplate: 'general' as CoaTemplateId });
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let logoFileInput = $state<HTMLInputElement | null>(null);
	let pickedLogoFile = $state<File | null>(null);
	let logoBusy = $state(false);

	function onPickLogo(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (!file) return;
		if (!AVATAR_ACCEPT.includes(file.type)) {
			errorMessage = 'Logo harus berformat JPG, PNG, atau WebP';
			return;
		}
		if (file.size > AVATAR_MAX_INPUT_BYTES) {
			errorMessage = 'Ukuran logo maksimal 5 MB';
			return;
		}
		message = errorMessage = null;
		pickedLogoFile = file;
	}

	async function onConfirmLogo(blob: Blob) {
		logoBusy = true;
		message = errorMessage = null;
		try {
			const form = new FormData();
			form.append('file', blob, 'logo.webp');
			const res = await fetch(`/api/companies/${data.company.id}/logo`, { method: 'PUT', body: form });
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? 'Gagal mengunggah logo');
			message = 'Logo perusahaan diperbarui.';
			pickedLogoFile = null;
			await invalidateAll();
		} finally {
			logoBusy = false;
		}
	}

	function onCancelLogo() {
		pickedLogoFile = null;
	}

	async function removeLogo() {
		logoBusy = true;
		message = errorMessage = null;
		try {
			await apiFetch(`/api/companies/${data.company.id}/logo`, { method: 'DELETE' });
			message = 'Logo perusahaan dihapus.';
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			logoBusy = false;
		}
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		message = errorMessage = null;
		if (!form.validateAll()) return;
		try {
			await apiFetch(`/api/companies/${data.company.id}`, { method: 'PATCH', json: toUpdate(form.values) });
			message = 'Data perusahaan disimpan.';
			await invalidateAll();
		} catch (err) {
			errorMessage = form.handleServerError(err);
		}
	}

	async function create(e: SubmitEvent) {
		e.preventDefault();
		message = errorMessage = null;
		if (!newForm.validateAll()) return;
		try {
			const res = await apiFetch<{ id: string }>('/api/companies', { method: 'POST', json: newForm.values });
			await apiFetch('/api/companies/switch', { method: 'POST', json: { companyId: res.id } });
			await invalidateAll();
			await goto('/settings/company');
		} catch (err) {
			errorMessage = newForm.handleServerError(err);
		}
	}
</script>

<PageHeader title="Perusahaan" />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

{#if data.showNew}
	<Card.Root class="mb-6 max-w-xl">
		<Card.Header><Card.Title>Perusahaan baru</Card.Title><Card.Description>Bagan akun (CoA) PSAK dan rule default dibuat otomatis sesuai template yang dipilih.</Card.Description></Card.Header>
		<Card.Content>
			<form class="grid items-start gap-3 sm:grid-cols-[1fr_auto_auto]" onsubmit={create} novalidate>
				<FormField id="new-name" label="Nama perusahaan" error={newForm.error('name')}>
					<Input bind:value={newForm.values.name} placeholder="PT Nama Perusahaan" {...newForm.attrs('name', 'new-name')} />
				</FormField>
				<FormField id="new-template" label="Template bagan akun">
					<SimpleSelect id="new-template" bind:value={newForm.values.coaTemplate} options={COA_TEMPLATES.map((t) => ({ value: t.id, label: t.label }))} />
				</FormField>
				<Button type="submit" class="sm:mt-[22px]">Buat</Button>
			</form>
		</Card.Content>
	</Card.Root>
{/if}

<Card.Root class="mb-6 max-w-xl">
	<Card.Header><Card.Title>Logo Perusahaan</Card.Title></Card.Header>
	<Card.Content class="flex flex-wrap items-center gap-5">
		{#if data.company.logoUrl}
			<img src={data.company.logoUrl} alt="Logo perusahaan" class="size-16 rounded-lg bg-chip-fixed object-contain" role="img" />
		{/if}
		<div class="flex flex-wrap gap-2">
			<input bind:this={logoFileInput} type="file" accept={AVATAR_ACCEPT.join(',')} class="sr-only" aria-label="Pilih logo perusahaan" onchange={onPickLogo} />
			<Button onclick={() => logoFileInput?.click()} disabled={logoBusy}>{data.company.logoUrl ? 'Ganti Logo' : 'Pilih Logo'}</Button>
			{#if data.company.logoUrl}
				<Button variant="ghost" onclick={removeLogo} disabled={logoBusy}>Hapus Logo</Button>
			{/if}
		</div>
	</Card.Content>
</Card.Root>

{#if pickedLogoFile}
	<LogoCropDialog file={pickedLogoFile} onconfirm={onConfirmLogo} oncancel={onCancelLogo} />
{/if}

<Card.Root class="max-w-xl">
	<Card.Content class="pt-6">
		<form class="space-y-4" onsubmit={save} novalidate>
			<FormField id="c-name" label="Nama" error={form.error('name')}>
				<Input bind:value={form.values.name} {...form.attrs('name', 'c-name')} />
			</FormField>
			<FormField id="c-npwp" label="NPWP" error={form.error('npwp')}>
				<Input bind:value={form.values.npwp} {...form.attrs('npwp', 'c-npwp')} />
			</FormField>
			<FormField id="c-addr" label="Alamat" error={form.error('address')}>
				<Input bind:value={form.values.address} {...form.attrs('address', 'c-addr')} />
			</FormField>
			<FormField id="c-bank" label="Akun bank (lawan jurnal eStatement)" error={form.error('bankAccountId')}>
				<SearchSelect
					bind:value={form.values.bankAccountId}
					options={[{ value: '', label: '— belum diatur —' }, ...toAccountOptions(data.assetAccounts)]}
					placeholder="— belum diatur —"
					searchPlaceholder="Cari kode atau nama akun…"
					emptyText="Tidak ada akun yang cocok"
					{...form.attrs('bankAccountId', 'c-bank')}
				/>
			</FormField>
			<Button type="submit">Simpan</Button>
		</form>
	</Card.Content>
</Card.Root>
