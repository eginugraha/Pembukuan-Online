<script lang="ts">
	import { textareaClass } from '$lib/ui';
	import { apiFetch } from '$lib/api-client';
	import FormField from '$lib/components/FormField.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { CreateContactInput } from '$lib/schemas/contact';

	type Contact = {
		id: string;
		kind: 'CUSTOMER' | 'VENDOR' | 'BOTH';
		name: string;
		npwp: string | null;
		attention: string | null;
		position: string | null;
		address: string | null;
		email: string | null;
		phone: string | null;
		code: string | null;
	};

	let {
		open = $bindable(false),
		contact,
		onsaved
	}: { open: boolean; contact: Contact | null; onsaved: (message: string) => void } = $props();

	const KIND_OPTIONS = [
		{ value: 'CUSTOMER', label: 'Pelanggan' },
		{ value: 'VENDOR', label: 'Vendor' },
		{ value: 'BOTH', label: 'Keduanya' }
	];
	const EMPTY = { kind: '', name: '', npwp: '', attention: '', position: '', address: '', email: '', phone: '', code: '' };
	// Kolom kosong dikirim sebagai string kosong (bukan undefined) supaya edit bisa mengosongkan isian.
	const toInput = (v: typeof EMPTY) => ({
		kind: v.kind || undefined,
		name: v.name,
		npwp: v.npwp,
		attention: v.attention,
		position: v.position,
		address: v.address,
		email: v.email,
		phone: v.phone,
		code: v.code
	});
	const form = new FormState(CreateContactInput, { ...EMPTY }, toInput);
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	$effect(() => {
		if (!open) return;
		errorMessage = null;
		form.reset(
			contact
				? {
						kind: contact.kind,
						name: contact.name,
						npwp: contact.npwp ?? '',
						attention: contact.attention ?? '',
						position: contact.position ?? '',
						address: contact.address ?? '',
						email: contact.email ?? '',
						phone: contact.phone ?? '',
						code: contact.code ?? ''
					}
				: { ...EMPTY }
		);
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = null;
		if (!form.validateAll()) return;
		busy = true;
		try {
			if (contact) await apiFetch(`/api/invoicing/contacts/${contact.id}`, { method: 'PUT', json: toInput(form.values) });
			else await apiFetch('/api/invoicing/contacts', { method: 'POST', json: toInput(form.values) });
			open = false;
			onsaved(contact ? 'Kontak diperbarui.' : 'Kontak dibuat.');
		} catch (err) {
			errorMessage = form.handleServerError(err);
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{contact ? 'Ubah kontak' : 'Tambah kontak'}</Dialog.Title>
			<Dialog.Description>Data ini dipakai di invoice dan purchase order.</Dialog.Description>
		</Dialog.Header>
		<form class="grid gap-3 sm:grid-cols-2" onsubmit={save} novalidate>
			<FormField id="contact-kind" label="Jenis" error={form.error('kind')}>
				<SimpleSelect bind:value={form.values.kind} options={KIND_OPTIONS} placeholder="Pilih jenis…" {...form.attrs('kind', 'contact-kind')} />
			</FormField>
			<FormField id="contact-name" label="Nama" error={form.error('name')}>
				<Input placeholder="mis. PT Mitra Jaya" bind:value={form.values.name} {...form.attrs('name', 'contact-name')} />
			</FormField>
			<FormField id="contact-code" label="Kode" error={form.error('code')}>
				<Input placeholder="mis. PLG" autocapitalize="characters" bind:value={form.values.code} {...form.attrs('code', 'contact-code')} />
			</FormField>
			<FormField id="contact-attention" label="Attention (untuk siapa)" error={form.error('attention')}>
				<Input bind:value={form.values.attention} {...form.attrs('attention', 'contact-attention')} />
			</FormField>
			<FormField id="contact-position" label="Posisi" error={form.error('position')}>
				<Input bind:value={form.values.position} {...form.attrs('position', 'contact-position')} />
			</FormField>
			<FormField id="contact-address" label="Alamat" error={form.error('address')} class="sm:col-span-2">
				<textarea bind:value={form.values.address} {...form.attrs('address', 'contact-address')} rows="3" class={textareaClass}></textarea>
			</FormField>
			<FormField id="contact-phone" label="Nomor telepon" error={form.error('phone')}>
				<Input type="tel" bind:value={form.values.phone} {...form.attrs('phone', 'contact-phone')} />
			</FormField>
			<FormField id="contact-email" label="Email" error={form.error('email')}>
				<Input type="email" bind:value={form.values.email} {...form.attrs('email', 'contact-email')} />
			</FormField>
			<FormField id="contact-npwp" label="NPWP" error={form.error('npwp')}>
				<Input bind:value={form.values.npwp} {...form.attrs('npwp', 'contact-npwp')} />
			</FormField>
			{#if errorMessage}<p role="alert" class="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive sm:col-span-2">{errorMessage}</p>{/if}
			<Dialog.Footer class="sm:col-span-2">
				<Button type="button" variant="outline" onclick={() => (open = false)}>Batal</Button>
				<Button type="submit" disabled={busy}>Simpan</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
