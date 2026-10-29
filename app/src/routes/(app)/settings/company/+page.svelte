<script lang="ts">
	import { textareaClass } from '$lib/ui';
	import { goto, invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { apiFetch } from '$lib/api-client';
	import FormField from '$lib/components/FormField.svelte';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { CreateCompanyInput, DeleteCompanyInput, UpdateCompanyInput } from '$lib/schemas/company';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import { accountOptions as toAccountOptions } from '$lib/account-options';
	import { COA_TEMPLATES, type CoaTemplateId } from '$lib/coa-templates';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { loadBitmap, renderLogo } from '$lib/logo-resize';
	import { AVATAR_ACCEPT, AVATAR_MAX_INPUT_BYTES } from '$lib/image';
	import SignerSettings from '$lib/components/SignerSettings.svelte';

	let { data } = $props();
	// Nilai awal form diambil sekali dari data (snapshot), lalu diedit lokal.
	const initialForm = () => ({
		name: data.company?.name ?? '',
		npwp: data.company?.npwp ?? '',
		address: data.company?.address ?? '',
		bankAccountId: data.company?.bankAccountId ?? '',
		code: data.company?.code ?? '',
		email: data.company?.email ?? '',
		phone: data.company?.phone ?? '',
		bankName: data.company?.bankName ?? '',
		bankAccountNo: data.company?.bankAccountNo ?? '',
		bankAccountHolder: data.company?.bankAccountHolder ?? '',
		swiftCode: data.company?.swiftCode ?? '',
	});
	type CompanyForm = ReturnType<typeof initialForm>;
	// Field baru dikirim sebagai string (kosong = hapus), sesuai kontrak updateCompany.
	const toUpdate = (v: CompanyForm) => ({
		name: v.name,
		npwp: v.npwp || null,
		address: v.address || null,
		bankAccountId: v.bankAccountId || null,
		code: v.code,
		email: v.email,
		phone: v.phone,
		bankName: v.bankName,
		bankAccountNo: v.bankAccountNo,
		bankAccountHolder: v.bankAccountHolder,
		swiftCode: v.swiftCode,
	});
	const form = new FormState(UpdateCompanyInput, initialForm(), toUpdate);
	const newForm = new FormState(CreateCompanyInput, { name: '', coaTemplate: 'general' as CoaTemplateId });
	// Halaman tidak di-remount saat perusahaan aktif berganti (pathname sama), jadi isi ulang form per perusahaan.
	let formCompanyId = data.company?.id;
	$effect(() => {
		const id = data.company?.id;
		if (id === formCompanyId) return;
		formCompanyId = id;
		form.reset(initialForm());
	});
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let logoFileInput = $state<HTMLInputElement | null>(null);
	let logoBusy = $state(false);

	// Logo diunggah utuh (tidak dipotong persegi), hanya diperkecil bila terlalu besar.
	async function onPickLogo(e: Event & { currentTarget: HTMLInputElement }) {
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
		logoBusy = true;
		message = errorMessage = null;
		try {
			const blob = await renderLogo(await loadBitmap(file));
			const form = new FormData();
			form.append('file', blob, 'logo.webp');
			const res = await fetch(`/api/companies/${data.company?.id}/logo`, { method: 'PUT', body: form });
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? 'Gagal mengunggah logo');
			message = 'Logo perusahaan diperbarui.';
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Gagal mengunggah logo';
		} finally {
			logoBusy = false;
		}
	}

	async function removeLogo() {
		logoBusy = true;
		message = errorMessage = null;
		try {
			await apiFetch(`/api/companies/${data.company?.id}/logo`, { method: 'DELETE' });
			message = 'Logo perusahaan dihapus.';
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			logoBusy = false;
		}
	}

	// Tanda tangan / watermark: file mentah, tanpa crop.
	type AssetKind = 'watermark';
	const ASSETS: { kind: AssetKind; title: string; label: string; urlKey: 'watermarkUrl' }[] = [
		{ kind: 'watermark', title: 'Watermark', label: 'watermark', urlKey: 'watermarkUrl' }
	];
	const ASSET_MAX_BYTES = 512 * 1024;
	let assetBusy = $state(false);
	let assetInputs = $state<Record<AssetKind, HTMLInputElement | null>>({ watermark: null });

	async function onPickAsset(kind: AssetKind, label: string, e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (!file) return;
		message = errorMessage = null;
		if (!AVATAR_ACCEPT.includes(file.type)) {
			errorMessage = `Gambar ${label} harus berformat JPG, PNG, atau WebP`;
			return;
		}
		if (file.size > ASSET_MAX_BYTES) {
			errorMessage = `Ukuran gambar ${label} maksimal 512 KB`;
			return;
		}
		assetBusy = true;
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await fetch(`/api/companies/${data.company?.id}/assets/${kind}`, { method: 'PUT', body });
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? `Gagal mengunggah ${label}`);
			message = `Gambar ${label} diperbarui.`;
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			assetBusy = false;
		}
	}

	async function removeAsset(kind: AssetKind, label: string) {
		assetBusy = true;
		message = errorMessage = null;
		try {
			await apiFetch(`/api/companies/${data.company?.id}/assets/${kind}`, { method: 'DELETE' });
			message = `Gambar ${label} dihapus.`;
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			assetBusy = false;
		}
	}

	let targetTemplate = $state('');

	const deleteForm = new FormState(DeleteCompanyInput, { confirmName: '' });
	let deleteOpen = $state(false);
	let deleteBusy = $state(false);
	let deleteError = $state<string | null>(null);
	const canDelete = $derived(!!data.company && deleteForm.values.confirmName === data.company.name);

	function onDeleteOpenChange(o: boolean) {
		deleteOpen = o;
		if (!o) {
			deleteForm.values.confirmName = '';
			deleteError = null;
		}
	}

	async function removeCompany(e: SubmitEvent) {
		e.preventDefault();
		if (!canDelete) return;
		deleteBusy = true;
		deleteError = null;
		try {
			await apiFetch(`/api/companies/${data.company?.id}`, { method: 'DELETE', json: { confirmName: deleteForm.values.confirmName } });
			deleteOpen = false;
			await invalidateAll();
			await goto('/dashboard');
		} catch (err) {
			deleteError = deleteForm.handleServerError(err);
		} finally {
			deleteBusy = false;
		}
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		message = errorMessage = null;
		if (!form.validateAll()) return;
		try {
			await apiFetch(`/api/companies/${data.company?.id}`, { method: 'PATCH', json: toUpdate(form.values) });
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

{#if data.company}
<Card.Root class="mb-6 max-w-xl">
	<Card.Header><Card.Title>Logo Perusahaan</Card.Title></Card.Header>
	<Card.Content class="flex flex-wrap items-center gap-5">
		{#if data.company.logoUrl}
			<img src={data.company.logoUrl} alt="Logo perusahaan" class="h-16 w-auto max-w-48 object-contain" />
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


<SignerSettings signers={data.signers} />

{#each ASSETS as a (a.kind)}
	{@const url = data.company[a.urlKey]}
	<Card.Root class="mb-6 max-w-xl">
		<Card.Header><Card.Title>{a.title}</Card.Title><Card.Description>PNG, JPG, atau WebP, maksimal 512 KB. Dipakai di PDF invoice.</Card.Description></Card.Header>
		<Card.Content class="flex flex-wrap items-center gap-5">
			{#if url}
				<img src={url} alt="Pratinjau {a.label}" class="h-16 max-w-40 rounded-lg bg-chip-fixed object-contain" />
			{/if}
			<div class="flex flex-wrap gap-2">
				<input bind:this={assetInputs[a.kind]} type="file" accept={AVATAR_ACCEPT.join(',')} class="sr-only" aria-label="Pilih gambar {a.label}" onchange={(e) => onPickAsset(a.kind, a.label, e)} />
				<Button onclick={() => assetInputs[a.kind]?.click()} disabled={assetBusy}>{url ? `Ganti ${a.title}` : `Unggah ${a.title}`}</Button>
				{#if url}
					<Button variant="ghost" onclick={() => removeAsset(a.kind, a.label)} disabled={assetBusy}>Hapus {a.title}</Button>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>
{/each}

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
				<textarea bind:value={form.values.address} {...form.attrs('address', 'c-addr')} rows="3" class={textareaClass}></textarea>
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
			<FormField id="c-code" label="Kode perusahaan" error={form.error('code')}>
				<Input bind:value={form.values.code} placeholder="mis. UJI" autocapitalize="characters" {...form.attrs('code', 'c-code')} />
			</FormField>
			<FormField id="c-email" label="Email" error={form.error('email')}>
				<Input type="email" bind:value={form.values.email} {...form.attrs('email', 'c-email')} />
			</FormField>
			<FormField id="c-phone" label="Telepon" error={form.error('phone')}>
				<Input type="tel" bind:value={form.values.phone} {...form.attrs('phone', 'c-phone')} />
			</FormField>
			<FormField id="c-bank-name" label="Nama bank" error={form.error('bankName')}>
				<Input bind:value={form.values.bankName} {...form.attrs('bankName', 'c-bank-name')} />
			</FormField>
			<FormField id="c-bank-no" label="Nomor rekening" error={form.error('bankAccountNo')}>
				<Input bind:value={form.values.bankAccountNo} {...form.attrs('bankAccountNo', 'c-bank-no')} />
			</FormField>
			<FormField id="c-bank-holder" label="Atas nama rekening" error={form.error('bankAccountHolder')}>
				<Input bind:value={form.values.bankAccountHolder} {...form.attrs('bankAccountHolder', 'c-bank-holder')} />
			</FormField>
			<FormField id="c-swift" label="Kode SWIFT" error={form.error('swiftCode')}>
				<Input bind:value={form.values.swiftCode} {...form.attrs('swiftCode', 'c-swift')} />
			</FormField>
			<Button type="submit">Simpan</Button>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root class="mt-6 max-w-xl">
	<Card.Header>
		<Card.Title>Template bagan akun</Card.Title>
		<Card.Description>Sesuaikan bagan akun dengan template lain. Setiap perubahan ditinjau dulu sebelum diterapkan; jurnal yang sudah ada tidak diubah.</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="grid items-start gap-3 sm:grid-cols-[1fr_auto]">
			<FormField id="coa-target" label="Template tujuan">
				<SimpleSelect id="coa-target" bind:value={targetTemplate} placeholder="Pilih template…" options={COA_TEMPLATES.map((t) => ({ value: t.id, label: t.label }))} />
			</FormField>
			<Button class="sm:mt-[22px]" disabled={!targetTemplate} onclick={() => goto(`/settings/company/coa-template?target=${targetTemplate}`)}>Ganti template bagan akun</Button>
		</div>
	</Card.Content>
</Card.Root>

{#if data.isSuperAdmin}
	<Card.Root class="mt-6 max-w-xl border-destructive/25">
		<Card.Header>
			<Card.Title class="text-destructive">Hapus perusahaan</Card.Title>
			<Card.Description>Menghapus perusahaan beserta seluruh datanya secara permanen. Tindakan ini tidak dapat dibatalkan.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button variant="destructive" onclick={() => onDeleteOpenChange(true)}>Hapus perusahaan</Button>
		</Card.Content>
	</Card.Root>

	<Dialog.Root open={deleteOpen} onOpenChange={onDeleteOpenChange}>
		<Dialog.Content>
			<form class="space-y-4" onsubmit={removeCompany} novalidate>
				<Dialog.Header>
					<Dialog.Title>Hapus perusahaan</Dialog.Title>
					<Dialog.Description>
						Semua data perusahaan ini (akun, transaksi, jurnal, invoice, PO, kontak, upload, logo, dan keanggotaan) akan terhapus permanen.
						Ketik nama perusahaan <strong>{data.company.name}</strong> untuk melanjutkan.
					</Dialog.Description>
				</Dialog.Header>
				{#if deleteError}<Alert.Root variant="destructive"><Alert.Description>{deleteError}</Alert.Description></Alert.Root>{/if}
				<FormField id="delete-confirm" label="Nama perusahaan" error={deleteForm.error('confirmName')}>
					<Input bind:value={deleteForm.values.confirmName} autocomplete="off" {...deleteForm.attrs('confirmName', 'delete-confirm')} />
				</FormField>
				<Dialog.Footer>
					<Button type="button" variant="ghost" onclick={() => onDeleteOpenChange(false)}>Batal</Button>
					<Button type="submit" variant="destructive" disabled={!canDelete || deleteBusy}>Hapus permanen</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
{/if}
