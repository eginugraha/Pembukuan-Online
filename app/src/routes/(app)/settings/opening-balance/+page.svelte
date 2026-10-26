<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { apiFetch, ClientApiError } from '$lib/api-client';
	import { todayIso } from '$lib/dates';
	import { formatIdr, sumMoney, toMoney } from '$lib/money';
	import { inputClass } from '$lib/ui';
	import { z } from 'zod';
	import FormField from '$lib/components/FormField.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { isoDate } from '$lib/schemas/common';

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
	const dateForm = new FormState(z.object({ date: isoDate }), { date: initialDate() });
	let values = $state(initial());
	const locked = $derived(data.lockedLabel !== null);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	const safe = (v: string) => (/^\d+(\.\d{1,2})?$/.test(v.trim()) ? v.trim() : '0');
	const totalDebit = $derived(sumMoney(Object.values(values).map((v) => safe(v.debit))));
	const totalCredit = $derived(sumMoney(Object.values(values).map((v) => safe(v.credit))));
	const balanced = $derived(totalDebit.eq(totalCredit) && !totalDebit.isZero());
	let linesError = $state<string | null>(null);

	// Validasi per sel: format nominal, dan satu baris hanya boleh debit ATAU kredit.
	const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;
	const cellError = (v: string) => (v.trim() !== '' && !AMOUNT.test(v.trim()) ? 'Format nominal tidak valid' : undefined);
	const rowErrors = $derived(
		Object.fromEntries(
			Object.entries(values).map(([id, v]) => {
				const debit = cellError(v.debit);
				const credit = cellError(v.credit);
				const both = !debit && !credit && Number(safe(v.debit)) > 0 && Number(safe(v.credit)) > 0;
				return [id, { debit, credit: credit ?? (both ? 'Isi debit atau kredit saja' : undefined) }];
			})
		)
	);
	const hasRowErrors = $derived(Object.values(rowErrors).some((r) => r.debit || r.credit));

	async function save() {
		message = errorMessage = linesError = null;
		if (!dateForm.validateAll() || hasRowErrors) return;
		busy = true;
		try {
			const lines = Object.entries(values).map(([accountId, v]) => ({
				accountId,
				debit: toMoney(safe(v.debit)),
				credit: toMoney(safe(v.credit))
			}));
			await apiFetch('/api/opening-balance', { method: 'PUT', json: { date: dateForm.values.date, lines } });
			message = 'Saldo awal disimpan.';
			await invalidateAll();
		} catch (err) {
			if (err instanceof ClientApiError && err.fields.lines) linesError = err.fields.lines;
			else errorMessage = dateForm.handleServerError(err);
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Saldo Awal" description="Saldo per akun pada tanggal mulai pembukuan. Total debit harus sama dengan total kredit.">
	{#snippet actions()}
		<Badge variant={balanced ? 'default' : 'destructive'}>{balanced ? 'Balance' : 'Belum balance'}</Badge>
		<Button onclick={save} disabled={!balanced || hasRowErrors || busy || locked}>Simpan</Button>
	{/snippet}
</PageHeader>

{#if data.lockedLabel}<Alert.Root class="mb-4"><Alert.Description>Saldo awal terkunci karena tahun buku {data.lockedLabel} sudah ditutup.</Alert.Description></Alert.Root>{/if}
{#if message}<Alert.Root class="mb-4"><Alert.Description>{message}</Alert.Description></Alert.Root>{/if}
{#if errorMessage}<Alert.Root variant="destructive" class="mb-4"><Alert.Description>{errorMessage}</Alert.Description></Alert.Root>{/if}

<FormField id="ob-date" label="Tanggal mulai" error={dateForm.error('date')} class="mb-4 max-w-xs {locked ? 'opacity-60' : ''}">
	<div inert={locked}><DateField bind:value={dateForm.values.date} aria-label="Tanggal mulai" {...dateForm.attrs('date', 'ob-date')} /></div>
</FormField>

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
				{#each ['debit', 'credit'] as const as side (side)}
					{@const err = rowErrors[a.id]?.[side]}
					<Table.Cell class="align-top">
						<input
							class="{inputClass} text-right"
							inputmode="decimal"
							placeholder="0"
							bind:value={values[a.id][side]}
							disabled={locked}
							aria-label="{side === 'debit' ? 'Debit' : 'Kredit'} {a.code}"
							aria-invalid={err ? 'true' : undefined}
							aria-describedby={err ? `ob-${a.id}-${side}-error` : undefined}
						/>
						{#if err}<p id="ob-{a.id}-{side}-error" role="alert" class="mt-1 text-right text-xs font-medium text-destructive">{err}</p>{/if}
					</Table.Cell>
				{/each}
			</Table.Row>
		{/each}
		<Table.Row class="total-row">
			<Table.Cell>Total</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatIdr(totalDebit)}</Table.Cell>
			<Table.Cell class="text-right tabular-nums">{formatIdr(totalCredit)}</Table.Cell>
		</Table.Row>
	</Table.Body>
</Table.Root>
</div>
{#if linesError}<p role="alert" class="mt-2 text-sm font-medium text-destructive">{linesError}</p>{/if}
{#if !balanced && !totalDebit.isZero()}<p class="mt-2 text-sm text-destructive">Total debit dan kredit belum sama (selisih Rp {formatIdr(totalDebit.minus(totalCredit).abs())}).</p>{/if}
<p class="mt-2 text-xs text-muted-foreground">Format angka: gunakan titik untuk desimal, tanpa pemisah ribuan (contoh 1500000.50).</p>
