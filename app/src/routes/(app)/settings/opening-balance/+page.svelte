<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch } from '$lib/api-client';
	import { todayIso } from '$lib/dates';
	import { formatIdr, sumMoney, toMoney } from '$lib/money';
	import { inputClass } from '$lib/ui';

	let { data } = $props();

	function initial() {
		const byAccount = new Map((data.opening?.lines ?? []).map((l) => [l.accountId, l]));
		return Object.fromEntries(
			data.accounts.map((a) => {
				const l = byAccount.get(a.id);
				return [a.id, { debit: l && l.debit !== '0.00' ? l.debit : '', credit: l && l.credit !== '0.00' ? l.credit : '' }];
			})
		) as Record<string, { debit: string; credit: string }>;
	}

	const initialDate = () => data.opening?.date ?? todayIso();
	let date = $state(initialDate());
	let values = $state(initial());
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	const safe = (v: string) => (/^\d+(\.\d{1,2})?$/.test(v.trim()) ? v.trim() : '0');
	const totalDebit = $derived(sumMoney(Object.values(values).map((v) => safe(v.debit))));
	const totalCredit = $derived(sumMoney(Object.values(values).map((v) => safe(v.credit))));
	const balanced = $derived(totalDebit.eq(totalCredit) && !totalDebit.isZero());

	async function save() {
		busy = true;
		message = errorMessage = null;
		try {
			const lines = Object.entries(values).map(([accountId, v]) => ({
				accountId,
				debit: toMoney(safe(v.debit)),
				credit: toMoney(safe(v.credit))
			}));
			await apiFetch('/api/opening-balance', { method: 'PUT', json: { date, lines } });
			message = 'Saldo awal disimpan.';
			await invalidateAll();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Gagal menyimpan';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Saldo Awal" description="Saldo per akun pada tanggal mulai pembukuan di Jurnalku. Total debit harus sama dengan total kredit.">
	{#snippet actions()}
		<Badge variant={balanced ? 'default' : 'destructive'}>{balanced ? 'Balance' : 'Belum balance'}</Badge>
		<Button onclick={save} disabled={!balanced || busy}>Simpan</Button>
	{/snippet}
</PageHeader>

{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<label class="mb-4 block max-w-xs text-sm">Tanggal mulai<input type="date" bind:value={date} class="{inputClass} mt-1" /></label>

<div class="panel px-2 py-1">
<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Akun</Table.Head>
			<Table.Head class="w-48 text-right">Debit</Table.Head>
			<Table.Head class="w-48 text-right">Kredit</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each data.accounts as a (a.id)}
			<Table.Row>
				<Table.Cell>{a.code} {a.name}</Table.Cell>
				<Table.Cell><input class="{inputClass} text-right" inputmode="decimal" placeholder="0" bind:value={values[a.id].debit} aria-label="Debit {a.code}" /></Table.Cell>
				<Table.Cell><input class="{inputClass} text-right" inputmode="decimal" placeholder="0" bind:value={values[a.id].credit} aria-label="Kredit {a.code}" /></Table.Cell>
			</Table.Row>
		{/each}
		<Table.Row class="border-t-2 border-border bg-pale font-bold text-deep hover:bg-pale">
			<Table.Cell>Total</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatIdr(totalDebit)}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatIdr(totalCredit)}</Table.Cell>
		</Table.Row>
	</Table.Body>
</Table.Root>
</div>
<p class="mt-2 text-xs text-muted-foreground">Format angka: gunakan titik untuk desimal, tanpa pemisah ribuan (contoh 1500000.50).</p>
