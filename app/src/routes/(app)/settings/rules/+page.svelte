<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch } from '$lib/api-client';
	import { selectClass } from '$lib/ui';

	let { data } = $props();
	let form = $state({ keyword: '', accountId: '', direction: '' });
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	const directionLabel = { DB: 'Keluar', CR: 'Masuk' } as const;

	async function run(fn: () => Promise<string>) {
		message = errorMessage = null;
		try {
			message = await fn();
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		}
	}

	const create = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			await apiFetch('/api/rules', {
				method: 'POST',
				json: { keyword: form.keyword, accountId: form.accountId, direction: form.direction || null }
			});
			form = { keyword: '', accountId: '', direction: '' };
			return 'Rule dibuat.';
		});
	};
	const remove = (id: string) =>
		run(async () => {
			await apiFetch(`/api/rules/${id}`, { method: 'DELETE' });
			return 'Rule dihapus.';
		});
</script>

<PageHeader title="Category Rules" description="Keyword dicocokkan (tanpa membedakan huruf besar/kecil) dengan keterangan transaksi. Rule USER selalu diutamakan dibanding SYSTEM." />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<Card.Root class="mb-6">
	<Card.Header><Card.Title>Tambah rule</Card.Title></Card.Header>
	<Card.Content>
		<form class="grid gap-2 md:grid-cols-4" onsubmit={create}>
			<Input placeholder="Keyword (min. 3 karakter)" bind:value={form.keyword} required />
			<select class={selectClass} bind:value={form.accountId} required aria-label="Akun">
				<option value="" disabled>Akun tujuan…</option>
				{#each data.accounts as a (a.id)}<option value={a.id}>{a.code} {a.name}</option>{/each}
			</select>
			<select class={selectClass} bind:value={form.direction} aria-label="Arah">
				<option value="">Masuk & keluar</option><option value="CR">Hanya uang masuk</option><option value="DB">Hanya uang keluar</option>
			</select>
			<Button type="submit">Tambah</Button>
		</form>
	</Card.Content>
</Card.Root>

<div class="panel px-2 py-1">
<Table.Root>
	<Table.Header>
		<Table.Row><Table.Head>Keyword</Table.Head><Table.Head>Arah</Table.Head><Table.Head>Akun</Table.Head><Table.Head>Sumber</Table.Head><Table.Head class="text-right">Prioritas</Table.Head><Table.Head></Table.Head></Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.rules as r (r.id)}
			<Table.Row>
				<Table.Cell class="font-mono">{r.keywordPattern}</Table.Cell>
				<Table.Cell>{r.direction ? directionLabel[r.direction] : 'Semua'}</Table.Cell>
				<Table.Cell>{r.accountCode} {r.accountName} {#if !r.accountActive}<Badge variant="outline">Akun nonaktif</Badge>{/if}</Table.Cell>
				<Table.Cell><Badge variant={r.source === 'USER' ? 'default' : 'secondary'}>{r.source}</Badge></Table.Cell>
				<Table.Cell class="text-right">{r.priority}</Table.Cell>
				<Table.Cell class="text-right">{#if data.canDelete}<Button size="sm" variant="ghost" onclick={() => remove(r.id)}>Hapus</Button>{/if}</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
</div>
