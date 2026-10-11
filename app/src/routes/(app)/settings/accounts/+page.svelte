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
	type Account = (typeof data.accounts)[number];

	const depth = $derived.by(() => {
		const byId = new Map(data.accounts.map((a) => [a.id, a]));
		const d = new Map<string, number>();
		for (const a of data.accounts) {
			let n = 0;
			let cur: Account | undefined = a;
			while (cur?.parentId) {
				n++;
				cur = byId.get(cur.parentId);
			}
			d.set(a.id, n);
		}
		return d;
	});

	let form = $state({ code: '', name: '', parentId: '', normalBal: '' });
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

	const create = (e: SubmitEvent) => {
		e.preventDefault();
		return run(async () => {
			await apiFetch('/api/accounts', {
				method: 'POST',
				json: { code: form.code, name: form.name, parentId: form.parentId, normalBal: form.normalBal || undefined }
			});
			form = { code: '', name: '', parentId: '', normalBal: '' };
			return 'Akun dibuat.';
		});
	};
	const patch = (id: string, body: Record<string, unknown>, msg: string) =>
		run(async () => {
			await apiFetch(`/api/accounts/${id}`, { method: 'PATCH', json: body });
			return msg;
		});
	const deactivate = (id: string) =>
		run(async () => {
			await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
			return 'Akun dinonaktifkan.';
		});
</script>

<PageHeader title="Chart of Accounts" description="Akun tidak dihapus, hanya dinonaktifkan. Hanya akun detail (leaf) yang dapat dipakai transaksi." />
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<Card.Root class="mb-6">
	<Card.Header><Card.Title>Tambah akun</Card.Title></Card.Header>
	<Card.Content>
		<form class="grid gap-2 md:grid-cols-5" onsubmit={create}>
			<select class={selectClass} bind:value={form.parentId} required aria-label="Akun induk">
				<option value="" disabled>Akun induk…</option>
				{#each data.accounts.filter((a) => a.isActive) as a (a.id)}<option value={a.id}>{a.code} {a.name}</option>{/each}
			</select>
			<Input placeholder="Kode" bind:value={form.code} required />
			<Input placeholder="Nama" bind:value={form.name} required />
			<select class={selectClass} bind:value={form.normalBal} aria-label="Saldo normal">
				<option value="">Saldo normal ikut induk</option>
				<option value="DEBIT">Debit</option>
				<option value="CREDIT">Kredit</option>
			</select>
			<Button type="submit">Tambah</Button>
		</form>
	</Card.Content>
</Card.Root>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Kode</Table.Head><Table.Head>Nama</Table.Head><Table.Head>Tipe</Table.Head><Table.Head>Saldo normal</Table.Head><Table.Head>Arus kas</Table.Head><Table.Head></Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.accounts as a (a.id)}
			<Table.Row class={a.isActive ? '' : 'opacity-50'}>
				<Table.Cell class="whitespace-nowrap">{a.code}</Table.Cell>
				<Table.Cell style="padding-left: {(depth.get(a.id) ?? 0) * 1.25 + 0.5}rem" class={a.isLeaf ? '' : 'font-medium'}>
					{a.name} {#if !a.isActive}<Badge variant="outline">Nonaktif</Badge>{/if}
				</Table.Cell>
				<Table.Cell>{a.type}</Table.Cell>
				<Table.Cell>
					<select class="{selectClass} w-28" value={a.normalBal} onchange={(e) => patch(a.id, { normalBal: e.currentTarget.value }, 'Saldo normal diperbarui.')} aria-label="Saldo normal {a.code}">
						<option value="DEBIT">Debit</option><option value="CREDIT">Kredit</option>
					</select>
				</Table.Cell>
				<Table.Cell>
					<select class="{selectClass} w-36" value={a.cashFlowCat ?? ''} onchange={(e) => patch(a.id, { cashFlowCat: e.currentTarget.value || null }, 'Kategori arus kas diperbarui.')} aria-label="Arus kas {a.code}">
						<option value="">—</option><option value="OPERATING">Operasional</option><option value="INVESTING">Investasi</option><option value="FINANCING">Pendanaan</option>
					</select>
				</Table.Cell>
				<Table.Cell class="text-right">
					{#if a.isActive}
						<Button size="sm" variant="ghost" onclick={() => deactivate(a.id)}>Nonaktifkan</Button>
					{:else}
						<Button size="sm" variant="ghost" onclick={() => patch(a.id, { isActive: true }, 'Akun diaktifkan.')}>Aktifkan</Button>
					{/if}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
