<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/table';
	import { apiFetch } from '$lib/api-client';
	import FormField from '$lib/components/FormField.svelte';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { CreateContactInput } from '$lib/schemas/contact';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import { roleAtLeast } from '$lib/roles';

	let { data } = $props();
	const KIND_LABELS = { CUSTOMER: 'Pelanggan', VENDOR: 'Vendor', BOTH: 'Keduanya' } as const;
	const KIND_OPTIONS = [
		{ value: 'CUSTOMER', label: 'Pelanggan' },
		{ value: 'VENDOR', label: 'Vendor' },
		{ value: 'BOTH', label: 'Keduanya' }
	];
	type Contact = (typeof data.contacts)[number];
	const CONTACT_COLUMNS: Column<Contact>[] = [
		{ key: 'name', label: 'Nama', sortable: true, searchable: true, text: (c) => c.name },
		{ key: 'kind', label: 'Jenis', sortable: true, text: (c) => KIND_LABELS[c.kind] },
		{ key: 'npwp', label: 'NPWP', searchable: true, text: (c) => c.npwp ?? '' },
		{ key: 'email', label: 'Email', searchable: true, text: (c) => c.email ?? '' },
		{ key: 'phone', label: 'Telepon', text: (c) => c.phone ?? '' },
		{ key: 'active', label: 'Aktif' }
	];
	const canManage = $derived(roleAtLeast(data.ctx.role, 'accountant'));

	const EMPTY = { kind: '', name: '', npwp: '', address: '', email: '', phone: '' };
	const toInput = (v: typeof EMPTY) => ({
		kind: v.kind || undefined,
		name: v.name,
		npwp: v.npwp || undefined,
		address: v.address || undefined,
		email: v.email || '',
		phone: v.phone || undefined
	});
	const form = new FormState(CreateContactInput, { ...EMPTY }, toInput);
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

	async function create(e: SubmitEvent) {
		e.preventDefault();
		message = errorMessage = null;
		if (!form.validateAll()) return;
		try {
			await apiFetch('/api/invoicing/contacts', { method: 'POST', json: toInput(form.values) });
			form.reset({ ...EMPTY });
			message = 'Kontak dibuat.';
			await invalidateAll();
		} catch (err) {
			errorMessage = form.handleServerError(err);
		}
	}
	const deactivate = (id: string) =>
		run(async () => {
			await apiFetch(`/api/invoicing/contacts/${id}`, { method: 'DELETE' });
			return 'Kontak dinonaktifkan.';
		});
	const activate = (id: string) =>
		run(async () => {
			await apiFetch(`/api/invoicing/contacts/${id}`, { method: 'PUT', json: { isActive: true } });
			return 'Kontak diaktifkan.';
		});
</script>

<PageHeader title="Kontak" description="Data pelanggan dan vendor yang dipakai di invoice dan purchase order." />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

{#if canManage}
	<Card.Root class="mb-6">
		<Card.Header><Card.Title>Tambah kontak</Card.Title></Card.Header>
		<Card.Content>
			<form class="grid items-start gap-3 md:grid-cols-[1fr_1.4fr_1fr_1fr_auto]" onsubmit={create} novalidate>
				<FormField id="contact-kind" label="Jenis" error={form.error('kind')}>
					<SimpleSelect bind:value={form.values.kind} options={KIND_OPTIONS} placeholder="Pilih jenis…" {...form.attrs('kind', 'contact-kind')} />
				</FormField>
				<FormField id="contact-name" label="Nama" error={form.error('name')}>
					<Input placeholder="mis. PT Mitra Jaya" bind:value={form.values.name} {...form.attrs('name', 'contact-name')} />
				</FormField>
				<FormField id="contact-npwp" label="NPWP" error={form.error('npwp')}>
					<Input bind:value={form.values.npwp} {...form.attrs('npwp', 'contact-npwp')} />
				</FormField>
				<FormField id="contact-email" label="Email" error={form.error('email')}>
					<Input type="email" bind:value={form.values.email} {...form.attrs('email', 'contact-email')} />
				</FormField>
				<Button type="submit" class="md:mt-[22px]">Tambah</Button>
			</form>
		</Card.Content>
	</Card.Root>
{/if}

<DataTable
	rows={data.contacts}
	columns={CONTACT_COLUMNS}
	rowKey={(c) => c.id}
	searchPlaceholder="Cari nama, NPWP, atau email…"
	emptyText="Belum ada kontak."
	rowClass={(c) => (c.isActive ? '' : 'opacity-50')}
>
	{#snippet cell(c, col)}
		{#if col.key === 'name'}
			{c.name}
		{:else if col.key === 'kind'}
			{KIND_LABELS[c.kind]}
		{:else if col.key === 'npwp'}
			{c.npwp ?? '—'}
		{:else if col.key === 'email'}
			{c.email ?? '—'}
		{:else if col.key === 'phone'}
			{c.phone ?? '—'}
		{:else if col.key === 'active'}
			<span class="flex items-center justify-between gap-2">
				{#if c.isActive}<Badge>Aktif</Badge>{:else}<Badge variant="outline">Nonaktif</Badge>{/if}
				{#if canManage}
					{#if c.isActive}
						<Button size="sm" variant="ghost" onclick={() => deactivate(c.id)}>Nonaktifkan</Button>
					{:else}
						<Button size="sm" variant="ghost" onclick={() => activate(c.id)}>Aktifkan</Button>
					{/if}
				{/if}
			</span>
		{/if}
	{/snippet}
</DataTable>
