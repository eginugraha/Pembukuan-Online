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
	import { CreateRuleInput } from '$lib/schemas/rule';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import { accountOptions as toAccountOptions } from '$lib/account-options';

	let { data } = $props();
	const EMPTY = { keyword: '', accountId: '', direction: '' };
	const toInput = (v: typeof EMPTY) => ({ keyword: v.keyword, accountId: v.accountId, direction: v.direction || null });
	const form = new FormState(CreateRuleInput, { ...EMPTY }, toInput);
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

	async function create(e: SubmitEvent) {
		e.preventDefault();
		message = errorMessage = null;
		if (!form.validateAll()) return;
		try {
			await apiFetch('/api/rules', { method: 'POST', json: toInput(form.values) });
			form.reset({ ...EMPTY });
			message = 'Rule dibuat.';
			await invalidateAll();
		} catch (err) {
			errorMessage = form.handleServerError(err);
		}
	}
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
		<form class="grid items-start gap-3 md:grid-cols-[1.3fr_1.5fr_1fr_auto]" onsubmit={create} novalidate>
			<FormField id="rule-keyword" label="Keyword" error={form.error('keyword')} hint="Min. 3 karakter, mis. TOKOPEDIA">
				<Input bind:value={form.values.keyword} {...form.attrs('keyword', 'rule-keyword')} />
			</FormField>
			<FormField id="rule-account" label="Akun tujuan" error={form.error('accountId')}>
				<SearchSelect
					bind:value={form.values.accountId}
					options={toAccountOptions(data.accounts)}
					placeholder="Pilih akun…"
					searchPlaceholder="Cari kode atau nama akun…"
					emptyText="Tidak ada akun yang cocok"
					{...form.attrs('accountId', 'rule-account')}
				/>
			</FormField>
			<FormField id="rule-direction" label="Arah">
				<SimpleSelect
					id="rule-direction"
					bind:value={form.values.direction}
					options={[
						{ value: '', label: 'Masuk & keluar' },
						{ value: 'CR', label: 'Hanya uang masuk' },
						{ value: 'DB', label: 'Hanya uang keluar' }
					]}
				/>
			</FormField>
			<Button type="submit" class="md:mt-[22px]">Tambah</Button>
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
