<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { apiFetch } from '$lib/api-client';
	import { fieldErrors } from '$lib/forms/validation';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { CreateInvoiceInput, InvoiceLineInput } from '$lib/schemas/invoice';
	import FormField from '$lib/components/FormField.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { accountOptions } from '$lib/account-options';
	import { D, formatIdr, sumMoney, toMoney } from '$lib/money';
	import { inputClass } from '$lib/ui';

	let { data } = $props();

	const contactOptions = $derived(data.contacts.map((c) => ({ value: c.id, label: c.name })));
	const receivableOptions = $derived(accountOptions(data.accounts));
	const taxAccountOptions = $derived(accountOptions(data.accounts));
	const revenueOptions = $derived(accountOptions(data.accounts.filter((a) => a.type === 'REVENUE')));

	// --- Field header: sama seperti form lain (lihat settings/rules, uploads/new) ---
	const EMPTY = { contactId: '', issueDate: '', receivableAccountId: '', taxRate: '', taxAccountId: '', notes: '' };
	const toInput = (v: typeof EMPTY) => ({
		contactId: v.contactId,
		issueDate: v.issueDate,
		receivableAccountId: v.receivableAccountId,
		taxRate: v.taxRate || undefined,
		taxAccountId: v.taxAccountId || undefined,
		notes: v.notes || undefined,
		lines: lines.map(({ description, quantity, unitPrice, revenueAccountId }) => ({ description, quantity, unitPrice, revenueAccountId }))
	});
	const form = new FormState(CreateInvoiceInput, { ...EMPTY }, toInput);
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	// --- Baris invoice: error per baris dihitung terhadap skema satu baris, bukan seluruh array ---
	// (sama seperti pola di uploads/new untuk baris transaksi manual).
	type Line = { description: string; quantity: string; unitPrice: string; revenueAccountId: string };
	let lines = $state<Line[]>([{ description: '', quantity: '', unitPrice: '', revenueAccountId: '' }]);
	let linesSubmitted = $state(false);
	let lineTouched = $state<Record<string, boolean>>({});
	const lineErrors = $derived(lines.map((l) => fieldErrors(InvoiceLineInput, l)));
	const hasLineErrors = $derived(lineErrors.some((e) => Object.keys(e).length > 0));
	function touchLine(i: number, field: keyof Line) {
		lineTouched = { ...lineTouched, [`${i}:${field}`]: true };
	}
	function lineError(i: number, field: keyof Line): string | undefined {
		return linesSubmitted || lineTouched[`${i}:${field}`] ? lineErrors[i]?.[field] : undefined;
	}
	function addLine() {
		lines = [...lines, { description: '', quantity: '', unitPrice: '', revenueAccountId: '' }];
	}
	function removeLine(i: number) {
		lines = lines.filter((_, idx) => idx !== i);
	}

	// Ringkasan subtotal/pajak/total hanya pratinjau klien; nilai final tetap dihitung ulang di server.
	const lineAmount = (l: Line) => (l.quantity && l.unitPrice ? D(l.quantity).times(l.unitPrice || 0) : D(0));
	const subtotal = $derived(sumMoney(lines.map(lineAmount)));
	const taxAmount = $derived(form.values.taxRate ? subtotal.times(form.values.taxRate).div(100) : D(0));
	const total = $derived(subtotal.plus(taxAmount));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = null;
		linesSubmitted = true;
		const headerValid = form.validateAll();
		if (!headerValid || hasLineErrors) return;
		busy = true;
		try {
			const res = await apiFetch<{ id: string }>('/api/invoicing/invoices', { method: 'POST', json: toInput(form.values) });
			await goto(`/invoicing/invoices/${res.id}`);
		} catch (err) {
			errorMessage = form.handleServerError(err);
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Buat Invoice" description="Invoice baru dibuat sebagai Draft; belum punya nomor dan belum menghasilkan jurnal." />

<Card.Root class="mb-6">
	<Card.Content class="pt-6">
		<form class="space-y-6" onsubmit={submit} novalidate>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<FormField id="invoice-contact" label="Pelanggan" error={form.error('contactId')}>
					<SearchSelect
						bind:value={form.values.contactId}
						options={contactOptions}
						placeholder="Pilih pelanggan…"
						searchPlaceholder="Cari pelanggan…"
						emptyText="Tidak ada pelanggan yang cocok"
						{...form.attrs('contactId', 'invoice-contact')}
					/>
				</FormField>
				<FormField id="invoice-issue-date" label="Tanggal invoice" error={form.error('issueDate')}>
					<DateField bind:value={form.values.issueDate} {...form.attrs('issueDate', 'invoice-issue-date')} />
				</FormField>
				<FormField id="invoice-receivable" label="Akun piutang usaha" error={form.error('receivableAccountId')}>
					<SearchSelect
						bind:value={form.values.receivableAccountId}
						options={receivableOptions}
						placeholder="Pilih akun…"
						searchPlaceholder="Cari kode atau nama akun…"
						emptyText="Tidak ada akun yang cocok"
						{...form.attrs('receivableAccountId', 'invoice-receivable')}
					/>
				</FormField>
				<FormField id="invoice-tax-rate" label="Tarif PPN % (opsional)" error={form.error('taxRate')}>
					<input
						class="{inputClass} text-right"
						inputmode="decimal"
						placeholder="0"
						bind:value={form.values.taxRate}
						{...form.attrs('taxRate', 'invoice-tax-rate')}
					/>
				</FormField>
				<FormField id="invoice-tax-account" label="Akun PPN" error={form.error('taxAccountId')}>
					<SearchSelect
						bind:value={form.values.taxAccountId}
						options={taxAccountOptions}
						placeholder="Pilih akun…"
						searchPlaceholder="Cari kode atau nama akun…"
						emptyText="Tidak ada akun yang cocok"
						{...form.attrs('taxAccountId', 'invoice-tax-account')}
					/>
				</FormField>
				<FormField id="invoice-notes" label="Catatan (opsional)" error={form.error('notes')}>
					<Input bind:value={form.values.notes} {...form.attrs('notes', 'invoice-notes')} />
				</FormField>
			</div>

			<div class="panel px-2 py-1">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Keterangan</Table.Head>
							<Table.Head class="w-28 text-right">Kuantitas</Table.Head>
							<Table.Head class="w-40 text-right">Harga satuan</Table.Head>
							<Table.Head>Akun pendapatan</Table.Head>
							<Table.Head class="w-32 text-right">Jumlah</Table.Head>
							<Table.Head class="w-10"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each lines as line, i (i)}
							{@const descErr = lineError(i, 'description')}
							{@const qtyErr = lineError(i, 'quantity')}
							{@const priceErr = lineError(i, 'unitPrice')}
							{@const accErr = lineError(i, 'revenueAccountId')}
							<Table.Row>
								<Table.Cell class="align-top">
									<input
										class={inputClass}
										aria-label="Keterangan baris {i + 1}"
										bind:value={line.description}
										aria-invalid={descErr ? 'true' : undefined}
										aria-describedby={descErr ? `invoice-line-${i}-description-error` : undefined}
										onblur={() => touchLine(i, 'description')}
									/>
									{#if descErr}<p id="invoice-line-{i}-description-error" role="alert" class="mt-1 text-xs font-medium text-destructive">{descErr}</p>{/if}
								</Table.Cell>
								<Table.Cell class="align-top">
									<input
										class="{inputClass} text-right"
										inputmode="decimal"
										placeholder="0"
										aria-label="Kuantitas baris {i + 1}"
										bind:value={line.quantity}
										aria-invalid={qtyErr ? 'true' : undefined}
										aria-describedby={qtyErr ? `invoice-line-${i}-quantity-error` : undefined}
										onblur={() => touchLine(i, 'quantity')}
									/>
									{#if qtyErr}<p id="invoice-line-{i}-quantity-error" role="alert" class="mt-1 text-right text-xs font-medium text-destructive">{qtyErr}</p>{/if}
								</Table.Cell>
								<Table.Cell class="align-top">
									<input
										class="{inputClass} text-right"
										inputmode="decimal"
										placeholder="0"
										aria-label="Harga satuan baris {i + 1}"
										bind:value={line.unitPrice}
										aria-invalid={priceErr ? 'true' : undefined}
										aria-describedby={priceErr ? `invoice-line-${i}-unit-price-error` : undefined}
										onblur={() => touchLine(i, 'unitPrice')}
									/>
									{#if priceErr}<p id="invoice-line-{i}-unit-price-error" role="alert" class="mt-1 text-right text-xs font-medium text-destructive">{priceErr}</p>{/if}
								</Table.Cell>
								<Table.Cell class="align-top">
									<SearchSelect
										bind:value={line.revenueAccountId}
										options={revenueOptions}
										placeholder="Pilih akun…"
										searchPlaceholder="Cari kode atau nama akun…"
										emptyText="Tidak ada akun yang cocok"
										aria-label="Akun pendapatan baris {i + 1}"
										aria-invalid={accErr ? 'true' : undefined}
										aria-describedby={accErr ? `invoice-line-${i}-account-error` : undefined}
										onblur={() => touchLine(i, 'revenueAccountId')}
									/>
									{#if accErr}<p id="invoice-line-{i}-account-error" role="alert" class="mt-1 text-xs font-medium text-destructive">{accErr}</p>{/if}
								</Table.Cell>
								<Table.Cell class="align-top text-right tabular-nums">{formatIdr(lineAmount(line))}</Table.Cell>
								<Table.Cell class="align-top">
									<Button type="button" variant="ghost" size="icon-sm" aria-label="Hapus baris {i + 1}" disabled={lines.length === 1} onclick={() => removeLine(i)}>
										<Trash2 class="size-4" />
									</Button>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
			<Button type="button" variant="outline" onclick={addLine}>Tambah Baris</Button>

			<div class="flex flex-col items-end gap-1 text-sm">
				<div class="flex w-64 justify-between"><span class="text-muted-foreground">Subtotal</span><span class="tabular-nums">{formatIdr(subtotal)}</span></div>
				<div class="flex w-64 justify-between"><span class="text-muted-foreground">PPN</span><span class="tabular-nums">{formatIdr(taxAmount)}</span></div>
				<div class="flex w-64 justify-between font-semibold"><span>Total</span><span class="tabular-nums">{formatIdr(total)}</span></div>
			</div>

			{#if errorMessage}
				<Alert.Root variant="destructive">
					<Alert.Title>Gagal menyimpan</Alert.Title>
					<Alert.Description>{errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}

			<Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Draft'}</Button>
		</form>
	</Card.Content>
</Card.Root>
