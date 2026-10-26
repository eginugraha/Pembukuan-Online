<script lang="ts">
	import { goto } from '$app/navigation';
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
	import { CreatePurchaseOrderInput } from '$lib/schemas/purchase-order';
	import FormField from '$lib/components/FormField.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { D, formatIdr, sumMoney } from '$lib/money';
	import { inputClass } from '$lib/ui';

	type Line = { description: string; quantity: string; unitPrice: string };
	type Initial = { contactId: string; subject?: string; issueDate: string; expectedDate?: string; dueDate?: string; discount?: string; taxRate: string; notes: string; lines: Line[] };

	let {
		kind,
		contacts,
		companyCode = null,
		docId,
		initial
	}: {
		kind: 'invoice' | 'po';
		contacts: { id: string; name: string; code?: string | null }[];
		companyCode?: string | null;
		docId?: string;
		initial?: Initial;
	} = $props();

	// Jenis dokumen dan nilai awal bersifat tetap selama komponen hidup (rute berganti = komponen baru).
	// svelte-ignore state_referenced_locally
	const isPo = kind === 'po';
	const COPY = isPo
		? { contact: 'Pemasok', contactPlaceholder: 'Pilih pemasok…', contactSearch: 'Cari pemasok…', contactEmpty: 'Tidak ada pemasok yang cocok', date: 'Tanggal PO', base: '/api/invoicing/purchase-orders', page: '/invoicing/purchase-orders' }
		: { contact: 'Pelanggan', contactPlaceholder: 'Pilih pelanggan…', contactSearch: 'Cari pelanggan…', contactEmpty: 'Tidak ada pelanggan yang cocok', date: 'Tanggal invoice', base: '/api/invoicing/invoices', page: '/invoicing/invoices' };
	const schema = isPo ? CreatePurchaseOrderInput : CreateInvoiceInput;

	const contactOptions = $derived(contacts.map((c) => ({ value: c.id, label: c.name })));

	// --- Field header ---
	const EMPTY = { contactId: '', subject: '', issueDate: '', expectedDate: '', dueDate: '', discount: '', taxRate: '', notes: '' };
	const toInput = (v: typeof EMPTY) => ({
		contactId: v.contactId,
		issueDate: v.issueDate,
		...(isPo ? { expectedDate: v.expectedDate || undefined } : { dueDate: v.dueDate || undefined, discount: v.discount || undefined }),
		...(isPo ? {} : { subject: v.subject || undefined }),
		taxRate: v.taxRate || undefined,
		notes: v.notes || undefined,
		lines: lines.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice }))
	});
	// svelte-ignore state_referenced_locally
	const form = new FormState(schema, { ...EMPTY, ...(initial ? { ...initial, expectedDate: initial.expectedDate ?? '', dueDate: initial.dueDate ?? '', discount: initial.discount ?? '', subject: initial.subject ?? '' } : {}) }, toInput);
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	// Peringatan kode hanya saat membuat; mengubah dokumen tidak memeriksa kode.
	const missingCompanyCode = $derived(!docId && !companyCode);
	const selectedContact = $derived(contacts.find((c) => c.id === form.values.contactId));
	const missingContactCode = $derived(!docId && !!selectedContact && !selectedContact.code);

	// --- Baris: error per baris dihitung terhadap skema satu baris, bukan seluruh array ---
	// svelte-ignore state_referenced_locally
	let lines = $state<Line[]>(initial ? initial.lines.map((l) => ({ ...l })) : [{ description: '', quantity: '', unitPrice: '' }]);
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
		lines = [...lines, { description: '', quantity: '', unitPrice: '' }];
	}
	function removeLine(i: number) {
		lines = lines.filter((_, idx) => idx !== i);
	}

	// Ringkasan hanya pratinjau klien; nilai final dihitung ulang di server.
	const lineAmount = (l: Line) => (l.quantity && l.unitPrice ? D(l.quantity).times(l.unitPrice || 0) : D(0));
	const subtotal = $derived(sumMoney(lines.map(lineAmount)));
	const discount = $derived(!isPo && /^\d+(\.\d+)?$/.test(form.values.discount) ? D(form.values.discount) : D(0));
	const taxAmount = $derived(form.values.taxRate ? subtotal.minus(discount).times(form.values.taxRate).div(100) : D(0));
	const total = $derived(subtotal.minus(discount).plus(taxAmount));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = null;
		linesSubmitted = true;
		const headerValid = form.validateAll();
		if (!headerValid || hasLineErrors) return;
		busy = true;
		try {
			if (docId) {
				await apiFetch(`${COPY.base}/${docId}`, { method: 'PUT', json: toInput(form.values) });
				await goto(`${COPY.page}/${docId}`);
			} else {
				const res = await apiFetch<{ id: string }>(COPY.base, { method: 'POST', json: toInput(form.values) });
				await goto(`${COPY.page}/${res.id}`);
			}
		} catch (err) {
			errorMessage = form.handleServerError(err);
		} finally {
			busy = false;
		}
	}
</script>

<Card.Root class="mb-6">
	<Card.Content class="pt-6">
		<form class="space-y-6" onsubmit={submit} novalidate>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<FormField id="doc-contact" label={COPY.contact} error={form.error('contactId')}>
					<SearchSelect
						bind:value={form.values.contactId}
						options={contactOptions}
						placeholder={COPY.contactPlaceholder}
						searchPlaceholder={COPY.contactSearch}
						emptyText={COPY.contactEmpty}
						{...form.attrs('contactId', 'doc-contact')}
					/>
				</FormField>
				<FormField id="doc-issue-date" label={COPY.date} error={form.error('issueDate')}>
					<DateField bind:value={form.values.issueDate} {...form.attrs('issueDate', 'doc-issue-date')} />
				</FormField>
				{#if !isPo}
					<FormField id="doc-subject" label="Perihal (opsional)" error={form.error('subject')} class="sm:col-span-3">
						<Input bind:value={form.values.subject} {...form.attrs('subject', 'doc-subject')} />
					</FormField>
				{/if}
				{#if isPo}
					<FormField id="doc-expected-date" label="Perkiraan tiba (opsional)" error={form.error('expectedDate')}>
						<DateField bind:value={form.values.expectedDate} {...form.attrs('expectedDate', 'doc-expected-date')} />
					</FormField>
				{:else}
					<FormField id="doc-due-date" label="Jatuh tempo (opsional)" error={form.error('dueDate')}>
						<DateField bind:value={form.values.dueDate} {...form.attrs('dueDate', 'doc-due-date')} />
					</FormField>
				{/if}
				{#if !isPo}
					<FormField id="doc-discount" label="Diskon Rp (opsional)" error={form.error('discount')}>
						<input
							class="{inputClass} text-right"
							inputmode="decimal"
							placeholder="0"
							bind:value={form.values.discount}
							{...form.attrs('discount', 'doc-discount')}
						/>
					</FormField>
				{/if}
				<FormField id="doc-tax-rate" label="Tarif PPN % (opsional)" error={form.error('taxRate')}>
					<input
						class="{inputClass} text-right"
						inputmode="decimal"
						placeholder="0"
						bind:value={form.values.taxRate}
						{...form.attrs('taxRate', 'doc-tax-rate')}
					/>
				</FormField>
				<FormField id="doc-notes" label="Catatan (opsional)" error={form.error('notes')}>
					<Input bind:value={form.values.notes} {...form.attrs('notes', 'doc-notes')} />
				</FormField>
			</div>

			<div class="panel px-2 py-1">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Keterangan</Table.Head>
							<Table.Head class="w-28 text-right">Kuantitas</Table.Head>
							<Table.Head class="w-40 text-right">Harga satuan</Table.Head>
							<Table.Head class="w-32 text-right">Jumlah</Table.Head>
							<Table.Head class="w-10"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each lines as line, i (i)}
							{@const descErr = lineError(i, 'description')}
							{@const qtyErr = lineError(i, 'quantity')}
							{@const priceErr = lineError(i, 'unitPrice')}
							<Table.Row>
								<Table.Cell class="align-top">
									<input
										class={inputClass}
										aria-label="Keterangan baris {i + 1}"
										bind:value={line.description}
										aria-invalid={descErr ? 'true' : undefined}
										aria-describedby={descErr ? `doc-line-${i}-description-error` : undefined}
										onblur={() => touchLine(i, 'description')}
									/>
									{#if descErr}<p id="doc-line-{i}-description-error" role="alert" class="mt-1 text-xs font-medium text-destructive">{descErr}</p>{/if}
								</Table.Cell>
								<Table.Cell class="align-top">
									<input
										class="{inputClass} text-right"
										inputmode="decimal"
										placeholder="0"
										aria-label="Kuantitas baris {i + 1}"
										bind:value={line.quantity}
										aria-invalid={qtyErr ? 'true' : undefined}
										aria-describedby={qtyErr ? `doc-line-${i}-quantity-error` : undefined}
										onblur={() => touchLine(i, 'quantity')}
									/>
									{#if qtyErr}<p id="doc-line-{i}-quantity-error" role="alert" class="mt-1 text-right text-xs font-medium text-destructive">{qtyErr}</p>{/if}
								</Table.Cell>
								<Table.Cell class="align-top">
									<input
										class="{inputClass} text-right"
										inputmode="decimal"
										placeholder="0"
										aria-label="Harga satuan baris {i + 1}"
										bind:value={line.unitPrice}
										aria-invalid={priceErr ? 'true' : undefined}
										aria-describedby={priceErr ? `doc-line-${i}-unit-price-error` : undefined}
										onblur={() => touchLine(i, 'unitPrice')}
									/>
									{#if priceErr}<p id="doc-line-{i}-unit-price-error" role="alert" class="mt-1 text-right text-xs font-medium text-destructive">{priceErr}</p>{/if}
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
				{#if !isPo}
					<div class="flex w-64 justify-between"><span class="text-muted-foreground">Diskon</span><span class="tabular-nums">{formatIdr(discount)}</span></div>
				{/if}
				<div class="flex w-64 justify-between"><span class="text-muted-foreground">PPN</span><span class="tabular-nums">{formatIdr(taxAmount)}</span></div>
				<div class="flex w-64 justify-between font-semibold"><span>Total</span><span class="tabular-nums">{formatIdr(total)}</span></div>
			</div>

			{#if errorMessage}
				<Alert.Root variant="destructive">
					<Alert.Title>Gagal menyimpan</Alert.Title>
					<Alert.Description>{errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if missingCompanyCode}
				<Alert.Root variant="destructive">
					<Alert.Description>Kode perusahaan belum diisi. <a href="/settings/company" class="underline">Isi di Pengaturan Perusahaan</a></Alert.Description>
				</Alert.Root>
			{/if}
			{#if missingContactCode}
				<Alert.Root variant="destructive">
					<Alert.Description>Kontak ini belum punya kode. <a href="/invoicing/contacts" class="underline">Isi kode di halaman Kontak</a></Alert.Description>
				</Alert.Root>
			{/if}

			<Button type="submit" disabled={busy || missingCompanyCode || missingContactCode}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
		</form>
	</Card.Content>
</Card.Root>
