<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { apiFetch } from '$lib/api-client';
	import { selectClass } from '$lib/ui';

	type Option = { id: string; code: string; name: string };
	let {
		open = $bindable(false),
		parents,
		oncreated
	}: { open: boolean; parents: Option[]; oncreated: (a: Option) => void } = $props();

	let code = $state('');
	let name = $state('');
	let parentId = $state('');
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		errorMessage = null;
		try {
			const res = await apiFetch<{ id: string }>('/api/accounts', { method: 'POST', json: { code, name, parentId } });
			oncreated({ id: res.id, code, name });
			code = name = parentId = '';
			open = false;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Gagal membuat akun';
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
		<form class="space-y-3" onsubmit={save}>
			<div class="space-y-1">
				<Label for="na-parent">Akun induk</Label>
				<select id="na-parent" class={selectClass} bind:value={parentId} required>
					<option value="" disabled>Pilih akun induk…</option>
					{#each parents as p (p.id)}<option value={p.id}>{p.code} {p.name}</option>{/each}
				</select>
			</div>
			<div class="space-y-1">
				<Label for="na-code">Kode</Label>
				<Input id="na-code" bind:value={code} placeholder="5-2014" required />
			</div>
			<div class="space-y-1">
				<Label for="na-name">Nama</Label>
				<Input id="na-name" bind:value={name} required />
			</div>
			{#if errorMessage}<p class="text-sm text-red-600">{errorMessage}</p>{/if}
			<Dialog.Footer>
				<Button type="submit" disabled={busy}>Simpan</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
