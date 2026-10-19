<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { apiFetch } from '$lib/api-client';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { CreateAdvanceReceiptInput } from '$lib/schemas/advance-receipt';
	import FormField from '$lib/components/FormField.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { accountOptions } from '$lib/account-options';
	import { inputClass } from '$lib/ui';

	let { data } = $props();

	const contactOptions = $derived(data.contacts.map((c) => ({ value: c.id, label: c.name })));
	const deferredRevenueOptions = $derived(accountOptions(data.accounts.filter((a) => a.type === 'LIABILITY')));

	const EMPTY = { contactId: '', receiptDate: '', amount: '', deferredRevenueAccountId: '' };
	const toInput = (v: typeof EMPTY) => ({ ...v });
	const form = new FormState(CreateAdvanceReceiptInput, { ...EMPTY }, toInput);
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = null;
		if (!form.validateAll()) return;
		busy = true;
		try {
			const res = await apiFetch<{ id: string }>('/api/invoicing/advance-receipts', { method: 'POST', json: toInput(form.values) });
			await goto(`/invoicing/advance-receipts/${res.id}`);
		} catch (err) {
			errorMessage = form.handleServerError(err);
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Catat Uang Muka" description="Uang muka diposting langsung (Dr bank / Cr pendapatan diterima dimuka); tidak ada tahap Draft." />

<Card.Root class="mb-6">
	<Card.Content class="pt-6">
		<form class="space-y-6" onsubmit={submit} novalidate>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<FormField id="advance-receipt-contact" label="Pelanggan" error={form.error('contactId')}>
					<SearchSelect
						bind:value={form.values.contactId}
						options={contactOptions}
						placeholder="Pilih pelanggan…"
						searchPlaceholder="Cari pelanggan…"
						emptyText="Tidak ada pelanggan yang cocok"
						{...form.attrs('contactId', 'advance-receipt-contact')}
					/>
				</FormField>
				<FormField id="advance-receipt-date" label="Tanggal terima" error={form.error('receiptDate')}>
					<DateField bind:value={form.values.receiptDate} {...form.attrs('receiptDate', 'advance-receipt-date')} />
				</FormField>
				<FormField id="advance-receipt-amount" label="Jumlah" error={form.error('amount')}>
					<input
						class="{inputClass} text-right"
						inputmode="decimal"
						placeholder="0"
						bind:value={form.values.amount}
						{...form.attrs('amount', 'advance-receipt-amount')}
					/>
				</FormField>
				<FormField id="advance-receipt-account" label="Akun pendapatan diterima dimuka" error={form.error('deferredRevenueAccountId')}>
					<SearchSelect
						bind:value={form.values.deferredRevenueAccountId}
						options={deferredRevenueOptions}
						placeholder="Pilih akun…"
						searchPlaceholder="Cari kode atau nama akun…"
						emptyText="Tidak ada akun yang cocok"
						{...form.attrs('deferredRevenueAccountId', 'advance-receipt-account')}
					/>
				</FormField>
			</div>

			{#if errorMessage}
				<Alert.Root variant="destructive">
					<Alert.Title>Gagal menyimpan</Alert.Title>
					<Alert.Description>{errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}

			<Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Catat Uang Muka'}</Button>
		</form>
	</Card.Content>
</Card.Root>
