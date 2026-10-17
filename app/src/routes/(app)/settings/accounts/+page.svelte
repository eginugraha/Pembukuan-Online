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
	import FormField from '$lib/components/FormField.svelte';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { CreateAccountInput } from '$lib/schemas/account';
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

	const EMPTY = { code: '', name: '', parentId: '', normalBal: '' };
	const toInput = (v: typeof EMPTY) => ({ code: v.code, name: v.name, parentId: v.parentId, normalBal: v.normalBal || undefined });
	const form = new FormState(CreateAccountInput, { ...EMPTY }, toInput);
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
			await apiFetch('/api/accounts', { method: 'POST', json: toInput(form.values) });
			form.reset({ ...EMPTY });
			message = 'Akun dibuat.';
			await invalidateAll();
		} catch (err) {
			errorMessage = form.handleServerError(err);
		}
	}
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
		<form class="grid items-start gap-3 md:grid-cols-[1.4fr_1fr_1.4fr_1.2fr_auto]" onsubmit={create} novalidate>
			<FormField id="acc-parent" label="Akun induk" error={form.error('parentId')}>
				<select class={selectClass} bind:value={form.values.parentId} {...form.attrs('parentId', 'acc-parent')}>
					<option value="" disabled>Pilih akun induk…</option>
					{#each data.accounts.filter((a) => a.isActive) as a (a.id)}<option value={a.id}>{a.code} {a.name}</option>{/each}
				</select>
			</FormField>
			<FormField id="acc-code" label="Kode" error={form.error('code')}>
				<Input placeholder="mis. 1-1008" bind:value={form.values.code} {...form.attrs('code', 'acc-code')} />
			</FormField>
			<FormField id="acc-name" label="Nama" error={form.error('name')}>
				<Input placeholder="mis. Kas Kecil" bind:value={form.values.name} {...form.attrs('name', 'acc-name')} />
			</FormField>
			<FormField id="acc-normal" label="Saldo normal">
				<select id="acc-normal" class={selectClass} bind:value={form.values.normalBal}>
					<option value="">Ikut akun induk</option>
					<option value="DEBIT">Debit</option>
					<option value="CREDIT">Kredit</option>
				</select>
			</FormField>
			<Button type="submit" class="md:mt-[22px]">Tambah</Button>
		</form>
	</Card.Content>
</Card.Root>

<div class="panel px-2 py-1">
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
</div>
