<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import DataTable from '$lib/components/DataTable.svelte';
	import ContactDialog from '$lib/components/ContactDialog.svelte';
	import type { Column } from '$lib/table';
	import { apiFetch } from '$lib/api-client';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();
	const KIND_LABELS = { CUSTOMER: 'Pelanggan', VENDOR: 'Vendor', BOTH: 'Keduanya' } as const;
	type Contact = (typeof data.contacts)[number];
	const CONTACT_COLUMNS: Column<Contact>[] = [
		{ key: 'name', label: 'Nama', sortable: true, searchable: true, text: (c) => c.name },
		{ key: 'kind', label: 'Jenis', sortable: true, text: (c) => KIND_LABELS[c.kind] },
		{ key: 'attention', label: 'Attention', searchable: true, text: (c) => [c.attention, c.position].filter(Boolean).join(' ') },
		{ key: 'email', label: 'Email', searchable: true, text: (c) => c.email ?? '' },
		{ key: 'phone', label: 'Telepon', text: (c) => c.phone ?? '' },
		{ key: 'actions', label: 'Aksi' }
	];
	const canManage = $derived(roleAtLeast(data.ctx.role, 'accountant'));

	let dialogOpen = $state(false);
	let editing = $state<Contact | null>(null);
	let deleting = $state<Contact | null>(null);
	let deleteOpen = $state(false);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	function openCreate() {
		editing = null;
		dialogOpen = true;
	}
	function openEdit(c: Contact) {
		editing = c;
		dialogOpen = true;
	}
	function openDelete(c: Contact) {
		deleting = c;
		deleteOpen = true;
	}
	async function saved(text: string) {
		errorMessage = null;
		message = text;
		await invalidateAll();
	}
	async function confirmDelete() {
		if (!deleting) return;
		message = errorMessage = null;
		busy = true;
		try {
			await apiFetch(`/api/invoicing/contacts/${deleting.id}`, { method: 'DELETE' });
			deleteOpen = false;
			message = 'Kontak dihapus.';
			await invalidateAll();
		} catch (err) {
			deleteOpen = false;
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Kontak" description="Data pelanggan dan vendor yang dipakai di invoice dan purchase order.">
	{#snippet actions()}
		{#if canManage}<Button onclick={openCreate}>Tambah kontak</Button>{/if}
	{/snippet}
</PageHeader>
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<DataTable
	rows={data.contacts}
	columns={CONTACT_COLUMNS}
	rowKey={(c) => c.id}
	searchPlaceholder="Cari nama, attention, atau email…"
	emptyText="Belum ada kontak."
	rowClass={(c) => (c.isActive ? '' : 'opacity-50')}
>
	{#snippet cell(c, col)}
		{#if col.key === 'name'}
			{c.name}
			{#if !c.isActive}<Badge variant="outline" class="ml-2">Nonaktif</Badge>{/if}
		{:else if col.key === 'kind'}
			{KIND_LABELS[c.kind]}
		{:else if col.key === 'attention'}
			{#if c.attention}
				{c.attention}{#if c.position}<span class="text-muted-foreground"> · {c.position}</span>{/if}
			{:else}—{/if}
		{:else if col.key === 'email'}
			{c.email ?? '—'}
		{:else if col.key === 'phone'}
			{c.phone ?? '—'}
		{:else if col.key === 'actions'}
			{#if canManage}
				<span class="flex gap-1">
					<Button size="sm" variant="ghost" onclick={() => openEdit(c)}>Ubah</Button>
					<Button size="sm" variant="ghost" onclick={() => openDelete(c)}>Hapus</Button>
				</span>
			{/if}
		{/if}
	{/snippet}
</DataTable>

<ContactDialog bind:open={dialogOpen} contact={editing} onsaved={saved} />

<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Hapus kontak</Dialog.Title>
			<Dialog.Description>
				{deleting?.name} akan dihapus dari daftar dan tidak bisa dipilih lagi di dokumen baru. Invoice dan PO lama tetap menampilkan datanya.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (deleteOpen = false)}>Batal</Button>
			<Button type="button" variant="destructive" disabled={busy} onclick={confirmDelete}>Hapus</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
