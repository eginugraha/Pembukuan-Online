<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import FormField from '$lib/components/FormField.svelte';
	import { apiFetch } from '$lib/api-client';
	import { AVATAR_ACCEPT } from '$lib/image';
	import type { SignerOption } from '$lib/server/company/signers';

	let { signers }: { signers: SignerOption[] } = $props();

	const MAX_BYTES = 512 * 1024;
	let editing = $state<SignerOption | 'new' | null>(null);
	let name = $state('');
	let title = $state('');
	let file = $state<File | null>(null);
	let removeImage = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let deleting = $state<SignerOption | null>(null);

	function openDialog(s: SignerOption | 'new') {
		editing = s;
		name = s === 'new' ? '' : s.name;
		title = s === 'new' ? '' : (s.title ?? '');
		file = null;
		removeImage = false;
		error = null;
	}

	function onPick(e: Event & { currentTarget: HTMLInputElement }) {
		const picked = e.currentTarget.files?.[0] ?? null;
		e.currentTarget.value = '';
		error = null;
		if (!picked) return;
		if (!AVATAR_ACCEPT.includes(picked.type)) return void (error = 'Gambar harus berformat JPG, PNG, atau WebP');
		if (picked.size > MAX_BYTES) return void (error = 'Ukuran gambar maksimal 512 KB');
		file = picked;
		removeImage = false;
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!editing) return;
		busy = true;
		error = null;
		try {
			const body = new FormData();
			body.set('name', name);
			body.set('title', title);
			if (file) body.set('file', file);
			if (removeImage) body.set('removeImage', '1');
			await apiFetch(editing === 'new' ? '/api/signers' : `/api/signers/${editing.id}`, { method: editing === 'new' ? 'POST' : 'PUT', body });
			editing = null;
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!deleting) return;
		busy = true;
		try {
			await apiFetch(`/api/signers/${deleting.id}`, { method: 'DELETE' });
			deleting = null;
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<Card.Root class="mb-6 max-w-xl">
	<Card.Header>
		<Card.Title>Penandatangan</Card.Title>
		<Card.Description>Dipilih saat mengunduh PDF invoice, receipt, dan PO. Gambar tanda tangan opsional (PNG, JPG, atau WebP, maksimal 512 KB).</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-3">
		{#if signers.length === 0}
			<p class="text-sm text-muted-foreground">Belum ada penandatangan. PDF akan memberi ruang kosong untuk tanda tangan basah.</p>
		{/if}
		{#each signers as s (s.id)}
			<div class="flex items-center gap-4 rounded-md border p-3">
				{#if s.hasImage}
					<img src="/api/signers/{s.id}/image" alt="Tanda tangan {s.name}" class="h-12 w-24 rounded bg-chip-fixed object-contain" />
				{/if}
				<div class="min-w-0 flex-1">
					<p class="truncate font-medium">{s.name}</p>
					{#if s.title}<p class="truncate text-sm text-muted-foreground">{s.title}</p>{/if}
				</div>
				<Button size="sm" variant="outline" onclick={() => openDialog(s)}>Ubah</Button>
				<Button size="sm" variant="ghost" onclick={() => (deleting = s)}>Hapus</Button>
			</div>
		{/each}
		<Button onclick={() => openDialog('new')}>Tambah Penandatangan</Button>
	</Card.Content>
</Card.Root>

<Dialog.Root open={editing !== null} onOpenChange={(o) => { if (!o) editing = null; }}>
	<Dialog.Content>
		<form class="space-y-4" onsubmit={save} novalidate>
			<Dialog.Header><Dialog.Title>{editing === 'new' ? 'Tambah penandatangan' : 'Ubah penandatangan'}</Dialog.Title></Dialog.Header>
			{#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
			<FormField id="signer-name" label="Nama"><Input id="signer-name" bind:value={name} /></FormField>
			<FormField id="signer-title" label="Jabatan"><Input id="signer-title" bind:value={title} /></FormField>
			<div class="space-y-2">
				<p class="text-sm font-medium">Tanda tangan</p>
				<p class="text-sm text-muted-foreground">
					{#if file}{file.name}{:else if removeImage}Gambar akan dihapus{:else if editing !== 'new' && editing?.hasImage}Gambar tersimpan{:else}Belum ada gambar{/if}
				</p>
				<input bind:this={fileInput} type="file" accept={AVATAR_ACCEPT.join(',')} class="sr-only" aria-label="Pilih gambar tanda tangan" onchange={onPick} />
				<div class="flex gap-2">
					<Button type="button" variant="outline" onclick={() => fileInput?.click()}>Pilih gambar</Button>
					{#if editing !== 'new' && editing?.hasImage && !removeImage}
						<Button type="button" variant="ghost" onclick={() => { removeImage = true; file = null; }}>Hapus gambar</Button>
					{/if}
				</div>
			</div>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (editing = null)}>Batal</Button>
				<Button type="submit" disabled={busy || !name.trim()}>Simpan</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={deleting !== null} onOpenChange={(o) => { if (!o) deleting = null; }}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Hapus penandatangan</Dialog.Title>
			<Dialog.Description>{deleting?.name} akan dihapus dari daftar. PDF yang sudah diunduh tidak berubah.</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="ghost" onclick={() => (deleting = null)}>Batal</Button>
			<Button variant="destructive" onclick={remove} disabled={busy}>Hapus</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
