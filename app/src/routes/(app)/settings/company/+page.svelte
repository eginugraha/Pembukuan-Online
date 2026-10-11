<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { apiFetch } from '$lib/api-client';
	import { selectClass } from '$lib/ui';

	let { data } = $props();
	// Nilai awal form diambil sekali dari data (snapshot), lalu diedit lokal.
	const initialForm = () => ({
		name: data.company.name,
		npwp: data.company.npwp ?? '',
		address: data.company.address ?? '',
		bankAccountId: data.company.bankAccountId ?? ''
	});
	let form = $state(initialForm());
	let newName = $state('');
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	async function run(fn: () => Promise<void>) {
		message = errorMessage = null;
		try {
			await fn();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		}
	}

	const save = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			await apiFetch(`/api/companies/${data.company.id}`, {
				method: 'PATCH',
				json: { name: form.name, npwp: form.npwp || null, address: form.address || null, bankAccountId: form.bankAccountId || null }
			});
			message = 'Data perusahaan disimpan.';
			await invalidateAll();
		});
	};

	const create = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			const res = await apiFetch<{ id: string }>('/api/companies', { method: 'POST', json: { name: newName } });
			await apiFetch('/api/companies/switch', { method: 'POST', json: { companyId: res.id } });
			await invalidateAll();
			await goto('/settings/company');
		});
	};
</script>

<PageHeader title="Perusahaan" />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

{#if data.showNew}
	<Card.Root class="mb-6 max-w-xl">
		<Card.Header><Card.Title>Perusahaan baru</Card.Title><Card.Description>CoA PSAK dan rule default akan dibuat otomatis.</Card.Description></Card.Header>
		<Card.Content>
			<form class="flex gap-2" onsubmit={create}>
				<Input bind:value={newName} placeholder="PT Nama Perusahaan" required />
				<Button type="submit">Buat</Button>
			</form>
		</Card.Content>
	</Card.Root>
{/if}

<Card.Root class="max-w-xl">
	<Card.Content class="pt-6">
		<form class="space-y-4" onsubmit={save}>
			<div class="space-y-1"><Label for="c-name">Nama</Label><Input id="c-name" bind:value={form.name} required /></div>
			<div class="space-y-1"><Label for="c-npwp">NPWP</Label><Input id="c-npwp" bind:value={form.npwp} maxlength={20} /></div>
			<div class="space-y-1"><Label for="c-addr">Alamat</Label><Input id="c-addr" bind:value={form.address} /></div>
			<div class="space-y-1">
				<Label for="c-bank">Akun bank (lawan jurnal eStatement)</Label>
				<select id="c-bank" class={selectClass} bind:value={form.bankAccountId}>
					<option value="">— belum diatur —</option>
					{#each data.assetAccounts as a (a.id)}<option value={a.id}>{a.code} {a.name}</option>{/each}
				</select>
			</div>
			<Button type="submit">Simpan</Button>
		</form>
	</Card.Content>
</Card.Root>
