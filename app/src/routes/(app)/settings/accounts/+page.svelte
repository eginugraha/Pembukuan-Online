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
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import { accountOptions } from '$lib/account-options';

	let { data } = $props();
	const NORMAL_BAL = [
		{ value: 'DEBIT', label: 'Debit' },
		{ value: 'CREDIT', label: 'Kredit' }
	];
	const CASH_FLOW = [
		{ value: '', label: '—' },
		{ value: 'OPERATING', label: 'Operasional' },
		{ value: 'INVESTING', label: 'Investasi' },
		{ value: 'FINANCING', label: 'Pendanaan' }
	];
	const parentOptions = $derived(accountOptions(data.accounts.filter((a) => a.isActive)));
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
				<SearchSelect
					bind:value={form.values.parentId}
					options={parentOptions}
					placeholder="Pilih akun induk…"
					searchPlaceholder="Cari kode atau nama akun…"
					emptyText="Tidak ada akun yang cocok"
					{...form.attrs('parentId', 'acc-parent')}
				/>
			</FormField>
			<FormField id="acc-code" label="Kode" error={form.error('code')}>
				<Input placeholder="mis. 1-1008" bind:value={form.values.code} {...form.attrs('code', 'acc-code')} />
			</FormField>
			<FormField id="acc-name" label="Nama" error={form.error('name')}>
				<Input placeholder="mis. Kas Kecil" bind:value={form.values.name} {...form.attrs('name', 'acc-name')} />
			</FormField>
			<FormField id="acc-normal" label="Saldo normal">
				<SimpleSelect id="acc-normal" bind:value={form.values.normalBal} options={[{ value: '', label: 'Ikut akun induk' }, ...NORMAL_BAL]} />
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
					<SimpleSelect
						class="w-28"
						value={a.normalBal}
						options={NORMAL_BAL}
						aria-label="Saldo normal {a.code}"
						onchange={(v) => patch(a.id, { normalBal: v }, 'Saldo normal diperbarui.')}
					/>
				</Table.Cell>
				<Table.Cell>
					<SimpleSelect
						class="w-36"
						value={a.cashFlowCat ?? ''}
						options={CASH_FLOW}
						aria-label="Arus kas {a.code}"
						onchange={(v) => patch(a.id, { cashFlowCat: v || null }, 'Kategori arus kas diperbarui.')}
					/>
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
