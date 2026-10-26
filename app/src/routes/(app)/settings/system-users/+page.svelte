<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/table';
	import { apiFetch } from '$lib/api-client';
	import { ROLE_LABELS, ROLES, type Role } from '$lib/roles';
	import FormField from '$lib/components/FormField.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { CreateUserInput, UpdateUserInput } from '$lib/schemas/user-admin';

	let { data } = $props();
	const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
	type SysUser = (typeof data.users)[number];
	const COLUMNS: Column<SysUser>[] = [
		{ key: 'name', label: 'Nama', sortable: true, searchable: true, text: (u) => u.name },
		{ key: 'email', label: 'Email', sortable: true, searchable: true, text: (u) => u.email },
		{ key: 'companies', label: 'Perusahaan', searchable: true, text: (u) => u.companies.map((c) => c.name).join(' ') },
		{ key: 'super', label: 'Super admin', sortable: true, text: (u) => (u.isSuperAdmin ? 'Ya' : 'Tidak') },
		{ key: 'actions', label: '', align: 'right' }
	];

	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function run(fn: () => Promise<string>) {
		message = errorMessage = null;
		try {
			message = await fn();
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		}
	}

	// Tambah pengguna
	const EMPTY = { name: '', email: '', password: '', isSuperAdmin: false };
	const addForm = new FormState(CreateUserInput, { ...EMPTY });
	async function add(e: SubmitEvent) {
		e.preventDefault();
		message = errorMessage = null;
		if (!addForm.validateAll()) return;
		try {
			await apiFetch('/api/admin/users', { method: 'POST', json: addForm.values });
			addForm.reset({ ...EMPTY });
			message = 'Pengguna baru dibuat.';
			await invalidateAll();
		} catch (err) {
			errorMessage = addForm.handleServerError(err);
		}
	}

	// Ubah pengguna
	const editForm = new FormState(UpdateUserInput, { name: '', email: '', password: '' }, (v) => ({
		name: v.name,
		email: v.email,
		password: v.password || undefined
	}));
	let editing = $state<SysUser | null>(null);
	let editError = $state<string | null>(null);
	let editBusy = $state(false);
	function openEdit(u: SysUser) {
		editForm.reset({ name: u.name, email: u.email, password: '' });
		editError = null;
		editing = u;
	}
	async function saveEdit(e: SubmitEvent) {
		e.preventDefault();
		if (!editing || !editForm.validateAll()) return;
		editBusy = true;
		editError = null;
		try {
			await apiFetch(`/api/admin/users/${editing.id}`, {
				method: 'PATCH',
				json: { name: editForm.values.name, email: editForm.values.email, password: editForm.values.password || undefined }
			});
			editing = null;
			message = 'Pengguna diperbarui.';
			errorMessage = null;
			await invalidateAll();
		} catch (err) {
			editError = editForm.handleServerError(err);
		} finally {
			editBusy = false;
		}
	}

	// Perusahaan (keanggotaan)
	let membersForId = $state<string | null>(null);
	const membersFor = $derived(data.users.find((u) => u.id === membersForId) ?? null);
	let membersError = $state<string | null>(null);
	let addCompanyId = $state('');
	let addRole = $state<Role>('viewer');
	const availableCompanies = $derived(
		membersFor ? data.companies.filter((c) => !membersFor.companies.some((m) => m.id === c.id)) : []
	);
	function openMembers(u: SysUser) {
		membersError = null;
		addCompanyId = '';
		addRole = 'viewer';
		membersForId = u.id;
	}
	async function memberCall(fn: () => Promise<unknown>) {
		membersError = null;
		try {
			await fn();
			await invalidateAll();
		} catch (err) {
			membersError = err instanceof Error ? err.message : 'Terjadi kesalahan';
		}
	}
	const putMembership = (userId: string, companyId: string, role: string) =>
		memberCall(() => apiFetch(`/api/admin/users/${userId}/companies/${companyId}`, { method: 'PUT', json: { role } }));
	const dropMembership = (userId: string, companyId: string) =>
		memberCall(() => apiFetch(`/api/admin/users/${userId}/companies/${companyId}`, { method: 'DELETE' }));
	async function addMembership() {
		if (!membersFor || !addCompanyId) return;
		await putMembership(membersFor.id, addCompanyId, addRole);
		if (!membersError) addCompanyId = '';
	}

	// Hapus pengguna
	let deleting = $state<SysUser | null>(null);
	let deleteError = $state<string | null>(null);
	let deleteBusy = $state(false);
	function openDelete(u: SysUser) {
		deleteError = null;
		deleting = u;
	}
	async function confirmDelete() {
		if (!deleting) return;
		deleteBusy = true;
		deleteError = null;
		try {
			await apiFetch(`/api/admin/users/${deleting.id}`, { method: 'DELETE' });
			deleting = null;
			message = 'Pengguna dihapus.';
			errorMessage = null;
			await invalidateAll();
		} catch (err) {
			deleteError = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			deleteBusy = false;
		}
	}

	const toggleSuper = (u: SysUser) =>
		run(async () => {
			await apiFetch(`/api/users/${u.id}/super-admin`, { method: 'PATCH', json: { value: !u.isSuperAdmin } });
			return u.isSuperAdmin ? 'Status super admin dicabut.' : 'Dijadikan super admin.';
		});
</script>

<PageHeader title="Semua Pengguna" />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<Card.Root class="mb-6">
	<Card.Header>
		<Card.Title>Tambah pengguna</Card.Title>
		<Card.Description>Membuat akun baru tanpa perusahaan. Atur keanggotaan perusahaan lewat tombol Perusahaan di tabel.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form class="grid items-start gap-3 md:grid-cols-[1.2fr_1.4fr_1.2fr_auto_auto]" onsubmit={add} novalidate>
			<FormField id="su-name" label="Nama" error={addForm.error('name')}>
				<Input bind:value={addForm.values.name} {...addForm.attrs('name', 'su-name')} />
			</FormField>
			<FormField id="su-email" label="Email" error={addForm.error('email')}>
				<Input type="email" autocomplete="off" bind:value={addForm.values.email} {...addForm.attrs('email', 'su-email')} />
			</FormField>
			<FormField id="su-password" label="Password awal" error={addForm.error('password')} hint="Min. 8 karakter">
				<Input type="password" autocomplete="new-password" bind:value={addForm.values.password} {...addForm.attrs('password', 'su-password')} />
			</FormField>
			<label class="flex items-center gap-2 text-sm md:mt-[30px]">
				<input type="checkbox" class="size-4 accent-primary" bind:checked={addForm.values.isSuperAdmin} />
				Super admin
			</label>
			<Button type="submit" class="md:mt-[22px]">Tambah</Button>
		</form>
	</Card.Content>
</Card.Root>

<DataTable rows={data.users} columns={COLUMNS} rowKey={(u) => u.id} searchPlaceholder="Cari nama, email, atau perusahaan…">
	{#snippet cell(u, c)}
		{#if c.key === 'name'}<span class="flex items-center gap-2.5"><UserAvatar name={u.name} image={u.image} class="size-8 text-xs" />{u.name}</span>
		{:else if c.key === 'email'}{u.email}
		{:else if c.key === 'companies'}
			{#if u.companies.length === 0}<span class="text-muted-foreground">—</span>
			{:else}<span class="flex flex-wrap gap-1.5">{#each u.companies as m (m.id)}<Badge variant="outline">{m.name} · {ROLE_LABELS[m.role]}</Badge>{/each}</span>{/if}
		{:else if c.key === 'super'}{#if u.isSuperAdmin}<Badge variant="secondary">Super admin</Badge>{/if}
		{:else if c.key === 'actions'}
			<span class="flex justify-end gap-2">
				<Button size="sm" variant="ghost" onclick={() => openEdit(u)} aria-label="Ubah {u.email}">Ubah</Button>
				<Button size="sm" variant="ghost" onclick={() => openMembers(u)} aria-label="Perusahaan {u.email}">Perusahaan</Button>
				{#if u.id !== data.me}
					<Button size="sm" variant="ghost" onclick={() => toggleSuper(u)}>
						{u.isSuperAdmin ? 'Cabut super admin' : 'Jadikan super admin'}
					</Button>
				{/if}
				<Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" disabled={u.id === data.me} onclick={() => openDelete(u)} aria-label="Hapus {u.email}">Hapus</Button>
			</span>
		{/if}
	{/snippet}
</DataTable>

<Dialog.Root open={editing !== null} onOpenChange={(o) => { if (!o) editing = null; }}>
	<Dialog.Content>
		<form class="space-y-4" onsubmit={saveEdit} novalidate>
			<Dialog.Header>
				<Dialog.Title>Ubah pengguna</Dialog.Title>
				<Dialog.Description>Perbarui nama, email, atau password pengguna ini.</Dialog.Description>
			</Dialog.Header>
			{#if editError}<Alert.Root variant="destructive"><Alert.Description>{editError}</Alert.Description></Alert.Root>{/if}
			<FormField id="eu-name" label="Nama" error={editForm.error('name')}>
				<Input bind:value={editForm.values.name} {...editForm.attrs('name', 'eu-name')} />
			</FormField>
			<FormField id="eu-email" label="Email" error={editForm.error('email')}>
				<Input type="email" autocomplete="off" bind:value={editForm.values.email} {...editForm.attrs('email', 'eu-email')} />
			</FormField>
			<FormField
				id="eu-password"
				label="Password baru"
				error={editForm.error('password')}
				hint="Kosongkan bila tidak diganti. Mengganti password mengeluarkan pengguna dari semua perangkat"
			>
				<Input type="password" autocomplete="new-password" bind:value={editForm.values.password} {...editForm.attrs('password', 'eu-password')} />
			</FormField>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (editing = null)}>Batal</Button>
				<Button type="submit" disabled={editBusy}>Simpan</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={membersFor !== null} onOpenChange={(o) => { if (!o) membersForId = null; }}>
	<Dialog.Content>
		{#if membersFor}
			<Dialog.Header>
				<Dialog.Title>Perusahaan</Dialog.Title>
				<Dialog.Description>Keanggotaan dan role {membersFor.name} ({membersFor.email}).</Dialog.Description>
			</Dialog.Header>
			{#if membersError}<Alert.Root variant="destructive"><Alert.Description>{membersError}</Alert.Description></Alert.Root>{/if}
			<ul class="space-y-2">
				{#each membersFor.companies as m (m.id)}
					<li class="flex items-center gap-2" data-testid="membership-row">
						<span class="min-w-0 flex-1 truncate text-sm">{m.name}</span>
						<SimpleSelect class="w-36" value={m.role} options={ROLE_OPTIONS} aria-label="Role di {m.name}" onchange={(v) => putMembership(membersFor.id, m.id, v)} />
						<Button size="sm" variant="ghost" onclick={() => dropMembership(membersFor.id, m.id)} aria-label="Lepas dari {m.name}">Lepas</Button>
					</li>
				{:else}
					<li class="text-sm text-muted-foreground">Belum tergabung di perusahaan mana pun.</li>
				{/each}
			</ul>
			{#if availableCompanies.length > 0}
				<div class="flex items-end gap-2 border-t pt-4">
					<FormField id="mb-company" label="Tambah ke perusahaan" class="flex-1">
						<SimpleSelect id="mb-company" bind:value={addCompanyId} placeholder="Pilih perusahaan…" options={availableCompanies.map((c) => ({ value: c.id, label: c.name }))} />
					</FormField>
					<FormField id="mb-role" label="Role">
						<SimpleSelect id="mb-role" class="w-36" bind:value={addRole} options={ROLE_OPTIONS} />
					</FormField>
					<Button type="button" disabled={!addCompanyId} onclick={addMembership}>Tambah</Button>
				</div>
			{/if}
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (membersForId = null)}>Tutup</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={deleting !== null} onOpenChange={(o) => { if (!o) deleting = null; }}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Hapus pengguna</Dialog.Title>
			<Dialog.Description>
				Akun <strong>{deleting?.email}</strong> akan dihapus permanen dan tidak dapat dikembalikan. Data yang pernah dibuatnya (jurnal, upload, dan lainnya) tetap ada.
			</Dialog.Description>
		</Dialog.Header>
		{#if deleteError}<Alert.Root variant="destructive"><Alert.Description>{deleteError}</Alert.Description></Alert.Root>{/if}
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => (deleting = null)}>Batal</Button>
			<Button type="button" variant="destructive" disabled={deleteBusy} onclick={confirmDelete}>Hapus permanen</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
