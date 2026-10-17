<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import FormField from '$lib/components/FormField.svelte';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { CreateAccountInput } from '$lib/schemas/account';
	import { apiFetch } from '$lib/api-client';
	import { selectClass } from '$lib/ui';

	type Option = { id: string; code: string; name: string };
	let {
		open = $bindable(false),
		parents,
		oncreated
	}: { open: boolean; parents: Option[]; oncreated: (a: Option) => void } = $props();

	const form = new FormState(CreateAccountInput, { code: '', name: '', parentId: '' });
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = null;
		if (!form.validateAll()) return;
		busy = true;
		try {
			const { code, name } = form.values;
			const res = await apiFetch<{ id: string }>('/api/accounts', { method: 'POST', json: form.values });
			oncreated({ id: res.id, code, name });
			form.reset({ code: '', name: '', parentId: '' });
			open = false;
		} catch (err) {
			errorMessage = form.handleServerError(err);
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Akun baru</Dialog.Title>
			<Dialog.Description>Tipe dan saldo normal mengikuti akun induk.</Dialog.Description>
		</Dialog.Header>
		<form class="space-y-3" onsubmit={save} novalidate>
			<FormField id="na-parent" label="Akun induk" error={form.error('parentId')}>
				<select class={selectClass} bind:value={form.values.parentId} {...form.attrs('parentId', 'na-parent')}>
					<option value="" disabled>Pilih akun induk…</option>
					{#each parents as p (p.id)}<option value={p.id}>{p.code} {p.name}</option>{/each}
				</select>
			</FormField>
			<FormField id="na-code" label="Kode" error={form.error('code')}>
				<Input bind:value={form.values.code} placeholder="5-2014" {...form.attrs('code', 'na-code')} />
			</FormField>
			<FormField id="na-name" label="Nama" error={form.error('name')}>
				<Input bind:value={form.values.name} {...form.attrs('name', 'na-name')} />
			</FormField>
			{#if errorMessage}<p class="text-sm text-destructive">{errorMessage}</p>{/if}
			<Dialog.Footer>
				<Button type="submit" disabled={busy}>Simpan</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
