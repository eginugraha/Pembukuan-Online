<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import NewAccountDialog from '$lib/components/NewAccountDialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { apiFetch } from '$lib/api-client';
	import { formatDate } from '$lib/dates';
	import { formatIdr } from '$lib/money';
	import { inputClass } from '$lib/ui';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { accountOptions as toAccountOptions } from '$lib/account-options';


	let { data } = $props();
	type Txn = (typeof data.transactions)[number];
	type Choice = { accountId: string; keyword: string; makeRule: boolean };

	let overrides = $state<Record<string, Partial<Choice>>>({});
	let extraAccounts = $state<{ id: string; code: string; name: string }[]>([]);
	let dialogOpen = $state(false);
	let dialogFor = $state<string | null>(null);
	let busyId = $state<string | null>(null);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	const accountOptions = $derived([...data.accounts, ...extraAccounts].sort((a, b) => a.code.localeCompare(b.code)));
	const groups = $derived.by(() => {
		const map = new Map<string, { uploadId: string; filename: string; items: Txn[] }>();
		for (const t of data.transactions) {
			const g = map.get(t.uploadId) ?? { uploadId: t.uploadId, filename: t.uploadFilename, items: [] };
			g.items.push(t);
			map.set(t.uploadId, g);
		}
		return [...map.values()];
	});

	function choice(t: Txn): Choice {
		return {
			accountId: t.suggestedAccountId ?? '',
			keyword: t.aiKeyword ?? t.groupKey,
			makeRule: true,
			...overrides[t.id]
		};
	}
	function setChoice(id: string, patch: Partial<Choice>) {
		overrides[id] = { ...overrides[id], ...patch };
	}

	async function act(id: string, fn: () => Promise<string>) {
		busyId = id;
		message = errorMessage = null;
		try {
			message = await fn();
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan';
		} finally {
			busyId = null;
		}
	}

	const confirm = (t: Txn) =>
		act(t.id, async () => {
			const c = choice(t);
			const res = await apiFetch<{ propagated: number }>(`/api/transactions/${t.id}/confirm`, {
				method: 'PATCH',
				json: { accountId: c.accountId, rule: c.makeRule ? { keyword: c.keyword } : null }
			});
			return res.propagated > 0
				? `Dikonfirmasi. Rule baru ikut mengonfirmasi ${res.propagated} transaksi lain.`
				: 'Transaksi dikonfirmasi.';
		});

	const bulk = (uploadId: string) =>
		act(uploadId, async () => {
			const res = await apiFetch<{ confirmed: number; propagated: number }>('/api/transactions/bulk-confirm', {
				method: 'POST',
				json: { uploadId, minConfidence: 0.8 }
			});
			return `${res.confirmed} saran AI diterima, ${res.propagated} transaksi lain ikut terkonfirmasi lewat rule.`;
		});
</script>

<PageHeader title="Review & Konfirmasi" description="Transaksi yang belum cocok dengan rule. Pilih akun, lalu konfirmasi; centang 'Buat rule' agar transaksi serupa otomatis terkategori." />

{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

{#if data.transactions.length === 0}
	<p class="panel p-8 text-center text-muted-foreground">Tidak ada transaksi yang menunggu konfirmasi.</p>
{/if}

{#each groups as g (g.uploadId)}
	<Card.Root class="mb-6">
		<Card.Header class="flex flex-row flex-wrap items-center justify-between gap-3">
			<Card.Title class="min-w-0 text-base"><a href="/uploads/{g.uploadId}" class="text-deep hover:underline">{g.filename}</a> · {g.items.length} transaksi</Card.Title>
			<Button variant="outline" size="sm" disabled={busyId !== null} onclick={() => bulk(g.uploadId)}>Konfirmasi semua saran ≥ 80%</Button>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#each g.items as t (t.id)}
				{@const c = choice(t)}
				{@const isDebit = t.debit !== '0.00'}
				<div class="grid gap-4 rounded-2xl border border-border bg-surface-soft p-4 transition-shadow hover:shadow-[0_12px_24px_-18px_rgb(30_60_25/0.4)] md:grid-cols-[minmax(0,1fr)_18rem]">
					<div>
						<div class="flex flex-wrap items-center gap-2 text-sm">
							<span class="text-muted-foreground">{formatDate(t.txnDate)}</span>
							<Badge variant={isDebit ? 'destructive' : 'success'}>{isDebit ? 'Keluar' : 'Masuk'}</Badge>
							<span class="font-bold tabular-nums {isDebit ? 'text-destructive' : 'text-green'}">Rp {formatIdr(isDebit ? t.debit : t.credit)}</span>
						</div>
						<p class="mt-1.5 font-medium break-words">{t.description}</p>
						{#if t.suggestedCode}
							<p class="mt-1 text-xs text-muted-foreground">
								Saran AI: <strong>{t.suggestedCode} {t.suggestedName}</strong>
								({Math.round(Number(t.aiConfidence ?? 0) * 100)}%){t.aiReason ? ` — ${t.aiReason}` : ''}
							</p>
						{:else}
							<p class="mt-1 text-xs text-muted-foreground/70">Tidak ada saran AI</p>
						{/if}
					</div>
					<div class="space-y-2">
						<SearchSelect
							value={c.accountId}
							options={toAccountOptions(accountOptions)}
							placeholder="Pilih akun…"
							searchPlaceholder="Cari kode atau nama akun…"
							emptyText="Tidak ada akun yang cocok"
							aria-label="Akun"
							onchange={(v) => setChoice(t.id, { accountId: v })}
						/>
						<label class="flex items-center gap-2 text-xs">
							<input type="checkbox" checked={c.makeRule} onchange={(e) => setChoice(t.id, { makeRule: e.currentTarget.checked })} />
							Buat rule dengan keyword
						</label>
						{#if c.makeRule}
							<input class={inputClass} value={c.keyword} oninput={(e) => setChoice(t.id, { keyword: e.currentTarget.value })} aria-label="Keyword rule" />
						{/if}
						<div class="flex gap-2">
							<Button size="sm" disabled={!c.accountId || busyId !== null} onclick={() => confirm(t)}>Konfirmasi</Button>
							<Button size="sm" variant="ghost" onclick={() => { dialogFor = t.id; dialogOpen = true; }}>Akun baru</Button>
						</div>
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
{/each}

<NewAccountDialog
	bind:open={dialogOpen}
	parents={data.parents}
	oncreated={(a) => {
		extraAccounts = [...extraAccounts, a];
		if (dialogFor) setChoice(dialogFor, { accountId: a.id });
	}}
/>
