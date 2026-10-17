<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Camera from '@lucide/svelte/icons/camera';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { apiFetch } from '$lib/api-client';
	import { AVATAR_ACCEPT, AVATAR_MAX_INPUT_BYTES, squareResize } from '$lib/image';
	import { ROLE_LABELS } from '$lib/roles';
	import FormField from '$lib/components/FormField.svelte';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { UpdateProfileInput } from '$lib/schemas/profile';

	let { data } = $props();
	const user = $derived(data.ctx.user);
	const roleLabel = $derived(user.isSuperAdmin ? 'Super Admin' : data.ctx.role ? ROLE_LABELS[data.ctx.role] : '—');

	// Nilai awal form diambil sekali (snapshot), lalu diedit lokal.
	// svelte-ignore state_referenced_locally
	const nameForm = new FormState(UpdateProfileInput, { name: data.ctx.user.name });
	let busy = $state(false);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function run(fn: () => Promise<string>) {
		busy = true;
		message = errorMessage = null;
		try {
			message = await fn();
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}

	function onPick(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (!file) return;
		if (!AVATAR_ACCEPT.includes(file.type)) {
			errorMessage = 'Foto harus berformat JPG, PNG, atau WebP';
			return;
		}
		if (file.size > AVATAR_MAX_INPUT_BYTES) {
			errorMessage = 'Ukuran foto maksimal 5 MB';
			return;
		}
		return run(async () => {
			const blob = await squareResize(file);
			const form = new FormData();
			form.append('file', blob, 'avatar.webp');
			const res = await fetch('/api/profile/avatar', { method: 'PUT', body: form });
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? 'Gagal mengunggah foto');
			return 'Foto profil diperbarui.';
		});
	}

	const removePhoto = () =>
		run(async () => {
			await apiFetch('/api/profile/avatar', { method: 'DELETE' });
			return 'Foto profil dihapus.';
		});

	async function saveName(e: SubmitEvent) {
		e.preventDefault();
		message = errorMessage = null;
		if (!nameForm.validateAll()) return;
		busy = true;
		try {
			await apiFetch('/api/profile', { method: 'PATCH', json: nameForm.values });
			message = 'Nama disimpan.';
			await invalidateAll();
		} catch (err) {
			errorMessage = nameForm.handleServerError(err);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Profil Saya · Jurnalku</title></svelte:head>

<PageHeader title="Profil Saya" description="Foto dan nama yang tampil di aplikasi." />

{#if message}<Alert.Root class="mb-4 max-w-2xl"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4 max-w-2xl"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<div class="grid max-w-2xl gap-6">
	<Card.Root>
		<Card.Header><Card.Title>Foto profil</Card.Title><Card.Description>JPG, PNG, atau WebP, maks. 5 MB. Foto dipotong persegi otomatis.</Card.Description></Card.Header>
		<Card.Content class="flex flex-wrap items-center gap-5">
			<UserAvatar name={user.name} image={user.image} class="size-24 rounded-3xl text-2xl" />
			<div class="flex flex-wrap gap-2">
				<input bind:this={fileInput} type="file" accept={AVATAR_ACCEPT.join(',')} class="sr-only" aria-label="Pilih foto profil" onchange={onPick} />
				<Button onclick={() => fileInput?.click()} disabled={busy}><Camera /> {user.image ? 'Ganti foto' : 'Unggah foto'}</Button>
				{#if user.image}
					<Button variant="ghost" onclick={removePhoto} disabled={busy}><Trash2 /> Hapus foto</Button>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>Informasi akun</Card.Title></Card.Header>
		<Card.Content>
			<form class="space-y-4" onsubmit={saveName} novalidate>
				<FormField id="p-name" label="Nama" error={nameForm.error('name')}>
					<Input bind:value={nameForm.values.name} {...nameForm.attrs('name', 'p-name')} />
				</FormField>
				<div class="space-y-1.5"><Label for="p-email">Email</Label><Input id="p-email" value={user.email} disabled /></div>
				<div class="space-y-1.5"><Label>Role</Label><p class="text-sm text-muted-foreground">{roleLabel}</p></div>
				<Button type="submit" disabled={busy || nameForm.values.name.trim() === user.name}>Simpan</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
