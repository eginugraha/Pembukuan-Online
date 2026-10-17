<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { accountOptions, classificationChange } from '$lib/account-options';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import FormField from '$lib/components/FormField.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	type Acc = {
		id: string;
		code: string;
		name: string;
		type: string;
		normalBal: string;
		isActive: boolean;
		isLeaf: boolean;
		parentId: string | null;
		cashFlowCat: 'OPERATING' | 'INVESTING' | 'FINANCING' | null;
	};
	type Usage = { journalLines: number; transactions: number; rules: number; children: number; isBankAccount: boolean };

	let {
		open = $bindable(false),
		account,
		accounts,
		bankAccountId,
		ondeleted
	}: {
		open: boolean;
		account: Acc | null;
		accounts: Acc[];
		bankAccountId: string | null;
		ondeleted: () => void;
	} = $props();

	let usage = $state<Usage | null>(null);
	let loading = $state(false);
	let moveToId = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	function loadUsage(id: string) {
		usage = null;
		error = null;
		loading = true;
		apiFetch<Usage>(`/api/accounts/${id}/usage`)
			.then((u) => (usage = u))
			.catch((e) => (error = e instanceof Error ? e.message : 'Gagal memuat data akun'))
			.finally(() => (loading = false));
	}
	$effect(() => {
		if (!open || !account) return;
		moveToId = '';
		loadUsage(account.id);
	});
	// Pemindahan bisa mengubah klasifikasi laporan; tampilkan sebagai peringatan (tidak memblokir).
	const changes = $derived(account && moveToId ? classificationChange(accounts, account.id, moveToId) : []);

	const used = $derived(!!usage && usage.journalLines + usage.transactions + usage.rules > 0);
	const blocked = $derived(usage?.isBankAccount ? 'Akun ini dipakai sebagai akun bank perusahaan. Ganti dulu di Pengaturan → Perusahaan.' : usage && usage.children > 0 ? 'Akun ini punya akun anak. Hapus atau pindahkan akun anaknya terlebih dahulu.' : null);
	// Tujuan pemindahan: aktif, detail, bukan akun ini/akun bank, tipe & saldo normal sama (agar laporan tidak terbalik).
	const targets = $derived(
		account ? accountOptions(accounts.filter((a) => a.id !== account.id && a.id !== bankAccountId && a.isActive && a.isLeaf && a.type === account.type && a.normalBal === account.normalBal)) : []
	);
	const parts = $derived(
		usage
			? [
					usage.journalLines && `${usage.journalLines} baris jurnal`,
					usage.transactions && `${usage.transactions} transaksi`,
					usage.rules && `${usage.rules} rule`
				].filter(Boolean)
			: []
	);

	async function confirm() {
		if (!account || !usage) return;
		error = null;
		if (used && !moveToId) {
			error = 'Pilih akun tujuan untuk memindahkan data';
			return;
		}
		busy = true;
		try {
			await apiFetch(`/api/accounts/${account.id}/delete`, { method: 'POST', json: used ? { moveToId } : {} });
			open = false;
			ondeleted();
		} catch (err) {
			error = err instanceof ClientApiError ? (err.fields.moveToId ?? err.message) : 'Gagal menghapus akun';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Hapus akun</Dialog.Title>
			<Dialog.Description>
				{account?.code} {account?.name}
			</Dialog.Description>
		</Dialog.Header>

		{#if loading}
			<p class="text-sm text-muted-foreground">Memeriksa penggunaan akun…</p>
		{:else if blocked}
			<p class="flex gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"><TriangleAlert class="mt-0.5 size-4 shrink-0" />{blocked}</p>
		{:else if usage}
			{#if used}
				<p class="flex gap-2 rounded-xl bg-amber-500/10 p-3 text-sm"><TriangleAlert class="mt-0.5 size-4 shrink-0 text-amber" />Akun ini sudah dipakai: {parts.join(', ')}. Semua data tersebut akan dipindahkan ke akun tujuan, lalu akun dihapus permanen.</p>
				<FormField id="da-target" label="Pindahkan data ke" error={error ?? undefined}>
					<SearchSelect
						id="da-target"
						bind:value={moveToId}
						options={targets}
						placeholder="Pilih akun tujuan…"
						searchPlaceholder="Cari kode atau nama akun…"
						emptyText="Tidak ada akun tujuan yang cocok (harus aktif, detail, tipe dan saldo normal sama)"
						aria-invalid={error ? 'true' : undefined}
						aria-describedby={error ? 'da-target-error' : undefined}
					/>
				</FormField>
				{#if changes.length}
					<p role="status" class="flex gap-2 rounded-xl bg-amber-500/10 p-3 text-sm"><TriangleAlert class="mt-0.5 size-4 shrink-0 text-amber" />Perhatian: pemindahan ini mengubah klasifikasi di laporan ({changes.join('; ')}).</p>
				{/if}
			{:else}
				<p class="text-sm">Akun ini belum dipakai. Hapus permanen? Tindakan ini tidak bisa dibatalkan.</p>
			{/if}
		{/if}
		{#if error && !(usage && used)}
			<p role="alert" class="text-sm font-medium text-destructive">{error}</p>
			{#if !usage && !loading && account}
				<Button type="button" variant="outline" size="sm" onclick={() => loadUsage(account!.id)}>Coba lagi</Button>
			{/if}
		{/if}

		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (open = false)}>Batal</Button>
			<Button type="button" variant="destructive" disabled={busy || loading || !!blocked || !usage} onclick={confirm}>Hapus akun</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
