<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { apiFetch } from '$lib/api-client';
	import { fieldErrors } from '$lib/forms/validation';
	import { FormState } from '$lib/forms/form-state.svelte';
	import { ArApTermInput, CreateArApInput } from '$lib/schemas/ar-ap';
	import { resolveTermAmounts } from '$lib/arap-terms';
	import FormField from '$lib/components/FormField.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import { D, sumMoney, toMoney } from '$lib/money';
	import { CURRENCIES, formatAmount, type Currency } from '$lib/currency';
	import { inputClass } from '$lib/ui';

	type Doc = { id: string; no: string; contactName: string; currency: string; total: string };
	type Entry = {
		id: string;
		kind: 'AR' | 'AP';
		contactId: string;
		title: string;
		total: string;
		currency: string;
		hasTerms: boolean;
		terms: { name: string | null; percent: string; amount: string; paid: boolean; document: { id: string } | null }[];
	};
	type Row = { name: string; mode: 'percent' | 'amount'; value: string; paid: boolean; documentId: string };

	let {
		kind,
		contacts,
		linkable,
		entry
	}: { kind: 'AR' | 'AP'; contacts: { id: string; name: string }[]; linkable: Doc[]; entry?: Entry } = $props();

	// Jenis dan nilai awal tetap selama komponen hidup (rute berganti = komponen baru).
	// svelte-ignore state_referenced_locally
	const isAr = (entry?.kind ?? kind) === 'AR';
	const COPY = isAr
		? { contact: 'Pelanggan', placeholder: 'Pilih pelanggan…', search: 'Cari pelanggan…', empty: 'Tidak ada pelanggan yang cocok', doc: 'Invoice', docSearch: 'Cari invoice…' }
		: { contact: 'Pemasok', placeholder: 'Pilih pemasok…', search: 'Cari pemasok…', empty: 'Tidak ada pemasok yang cocok', doc: 'Purchase order', docSearch: 'Cari PO…' };

	const HeaderInput = CreateArApInput.pick({ contactId: true, title: true, total: true, currency: true });
	// svelte-ignore state_referenced_locally
	const form = new FormState(HeaderInput, {
		contactId: entry?.contactId ?? '',
		title: entry?.title ?? '',
		total: entry?.total ?? '',
		currency: entry?.currency ?? 'IDR'
	});
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	/** Termin tersimpan dibuka sebagai persen bila persennya menghasilkan nominal yang sama persis; selain itu nominal. */
	function rowFromTerm(t: Entry['terms'][number], total: string): Row {
		const fromPercent = toMoney(D(total).times(t.percent).div(100));
		const asPercent = fromPercent === toMoney(t.amount);
		return { name: t.name ?? '', mode: asPercent ? 'percent' : 'amount', value: asPercent ? D(t.percent).toString() : D(t.amount).toString(), paid: t.paid, documentId: t.document?.id ?? '' };
	}

	// svelte-ignore state_referenced_locally
	let useTerms = $state(entry?.hasTerms ?? false);
	// svelte-ignore state_referenced_locally
	let rows = $state<Row[]>(entry?.hasTerms ? entry.terms.map((t) => rowFromTerm(t, entry.total)) : []);
	// Entri tanpa termin: termin implisit tunggal membawa status lunas dan dokumen.
	// svelte-ignore state_referenced_locally
	let paid = $state(entry && !entry.hasTerms ? (entry.terms[0]?.paid ?? false) : false);
	// svelte-ignore state_referenced_locally
	let documentId = $state(entry && !entry.hasTerms ? (entry.terms[0]?.document?.id ?? '') : '');
	// Bertermin -> tanpa termin: server menentukan lunas dari termin lama.
	// svelte-ignore state_referenced_locally
	const wasTerms = entry?.hasTerms ?? false;

	function toggleTerms(on: boolean) {
		useTerms = on;
		if (on && rows.length < 2) {
			const blank = (i: number): Row => ({ name: `Termin ${i}`, mode: 'percent', value: '', paid: false, documentId: '' });
			rows = [{ ...blank(1), documentId }, blank(2)];
		}
	}
	function addRow() {
		rows = [...rows, { name: `Termin ${rows.length + 1}`, mode: 'percent', value: '', paid: false, documentId: '' }];
	}
	function removeRow(i: number) {
		rows = rows.filter((_, idx) => idx !== i);
	}

	// --- Validasi baris termin (pola baris DocumentForm) ---
	const termInput = (r: Row) => ({
		name: r.name,
		percent: r.mode === 'percent' && r.value.trim() !== '' ? r.value.trim() : undefined,
		amount: r.mode === 'amount' && r.value.trim() !== '' ? r.value.trim() : undefined,
		paid: r.paid,
		documentId: r.documentId || null
	});
	let rowsSubmitted = $state(false);
	let rowTouched = $state<Record<string, boolean>>({});
	const rowErrors = $derived(rows.map((r) => fieldErrors(ArApTermInput, termInput(r))));
	function rowError(i: number, field: 'name' | 'value'): string | undefined {
		if (!rowsSubmitted && !rowTouched[`${i}:${field}`]) return undefined;
		const e = rowErrors[i] ?? {};
		return field === 'name' ? e.name : (e.percent ?? e.amount);
	}
	const touchRow = (i: number, field: 'name' | 'value') => (rowTouched = { ...rowTouched, [`${i}:${field}`]: true });

	// --- Pratinjau jumlah termin (nilai final dihitung ulang di server) ---
	const MONEY_RE = /^\d{1,16}(\.\d{1,2})?$/;
	const totalValid = $derived(MONEY_RE.test(form.values.total.trim()) && D(form.values.total.trim()).gt(0));
	const money = (v: string) => formatAmount(v, form.values.currency);
	const rowAmount = (r: Row): string | null => {
		const v = r.value.trim();
		if (!/^\d+(\.\d+)?$/.test(v)) return null;
		if (r.mode === 'amount') return toMoney(v);
		return totalValid ? toMoney(D(form.values.total.trim()).times(v).div(100)) : null;
	};
	const preview = $derived.by(() => {
		if (!useTerms || !totalValid) return null;
		const total = form.values.total.trim();
		let amounts: (string | null)[] = rows.map(rowAmount);
		let error: string | null = null;
		try {
			amounts = resolveTermAmounts(total, rows.map((r) => termInput(r))).map((a) => a.amount);
		} catch (e) {
			error = (e as Error).message;
		}
		const sum = toMoney(sumMoney(amounts.filter((a): a is string => a !== null)));
		return { amounts, sum, remaining: toMoney(D(total).minus(sum)), error };
	});

	// --- Dokumen ---
	const docLabel = (d: Doc) => `${d.no} · ${d.contactName} · ${formatAmount(d.total, d.currency)}`;
	const NONE = { value: '', label: `Tanpa ${COPY.doc.toLowerCase()}` };
	const singleOptions = $derived([NONE, ...linkable.map((d) => ({ value: d.id, label: docLabel(d) }))]);
	/** Dokumen yang sudah dipilih di baris lain tidak ditawarkan lagi (satu dokumen hanya untuk satu termin). */
	function rowOptions(i: number) {
		const taken = new Set(rows.filter((_, idx) => idx !== i).map((r) => r.documentId).filter(Boolean));
		return [NONE, ...linkable.filter((d) => !taken.has(d.id)).map((d) => ({ value: d.id, label: docLabel(d) }))];
	}
	const docById = (id: string) => linkable.find((d) => d.id === id);
	const mismatched = $derived.by(() => {
		const ids = useTerms ? rows.map((r) => r.documentId) : [documentId];
		return ids
			.filter(Boolean)
			.map(docById)
			.filter((d): d is Doc => !!d && d.currency !== form.values.currency);
	});

	function onSingleDocument(id: string) {
		const d = docById(id);
		if (d && form.values.total.trim() === '') {
			form.values.total = d.total;
			form.values.currency = d.currency;
		}
	}

	function payload() {
		return {
			kind: entry?.kind ?? kind,
			contactId: form.values.contactId,
			title: form.values.title,
			total: form.values.total.trim(),
			currency: form.values.currency as Currency,
			paid: useTerms ? false : paid,
			documentId: useTerms ? null : documentId || null,
			// Termin disimpan ulang dengan id baru, jadi tautan dokumen dikirim eksplisit per termin.
			terms: useTerms ? rows.map(termInput) : []
		};
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = null;
		rowsSubmitted = true;
		const headerValid = form.validateAll();
		if (!headerValid) return;
		if (useTerms) {
			if (rows.length < 2) {
				errorMessage = 'Termin minimal 2, atau matikan "Pakai termin"';
				return;
			}
			if (rowErrors.some((r) => Object.keys(r).length > 0)) return;
			if (preview?.error) {
				errorMessage = preview.error;
				return;
			}
		}
		busy = true;
		try {
			if (entry) {
				await apiFetch(`/api/invoicing/ar-ap/${entry.id}`, { method: 'PUT', json: payload() });
				await goto(`/invoicing/ar-ap/${entry.id}`);
			} else {
				const res = await apiFetch<{ id: string }>('/api/invoicing/ar-ap', { method: 'POST', json: payload() });
				await goto(`/invoicing/ar-ap/${res.id}`);
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
				<FormField id="arap-title" label="Judul" error={form.error('title')} class="sm:col-span-3">
					<Input bind:value={form.values.title} placeholder="mis. Proyek website PT Maju" {...form.attrs('title', 'arap-title')} />
				</FormField>
				<FormField id="arap-contact" label={COPY.contact} error={form.error('contactId')}>
					<SearchSelect
						bind:value={form.values.contactId}
						options={contacts.map((c) => ({ value: c.id, label: c.name }))}
						placeholder={COPY.placeholder}
						searchPlaceholder={COPY.search}
						emptyText={COPY.empty}
						{...form.attrs('contactId', 'arap-contact')}
					/>
				</FormField>
				<FormField id="arap-currency" label="Mata uang" error={form.error('currency')}>
					<SimpleSelect bind:value={form.values.currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} {...form.attrs('currency', 'arap-currency')} />
				</FormField>
				<FormField id="arap-total" label="Total {form.values.currency === 'USD' ? 'USD' : 'Rp'}" error={form.error('total')}>
					<input class="{inputClass} text-right" inputmode="decimal" placeholder="0" bind:value={form.values.total} {...form.attrs('total', 'arap-total')} />
				</FormField>
			</div>

			<label class="flex items-center gap-2 text-sm font-medium">
				<input type="checkbox" role="switch" class="size-4 accent-primary" checked={useTerms} onchange={(e) => toggleTerms(e.currentTarget.checked)} />
				Pakai termin
			</label>

			{#if !useTerms}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<FormField id="arap-document" label="{COPY.doc} (opsional)" class="sm:col-span-2">
						<SearchSelect
							id="arap-document"
							bind:value={documentId}
							options={singleOptions}
							placeholder={NONE.label}
							searchPlaceholder={COPY.docSearch}
							emptyText="Tidak ada dokumen yang cocok"
							onchange={onSingleDocument}
						/>
					</FormField>
					<div class="space-y-1.5 sm:mt-7">
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" role="switch" class="size-4 accent-primary" bind:checked={paid} disabled={wasTerms} />
							Sudah lunas
						</label>
						{#if wasTerms}
							<p class="text-xs text-muted-foreground">Status lunas ditentukan otomatis: lunas hanya bila semua termin sebelumnya sudah lunas.</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="space-y-3">
					{#each rows as row, i (i)}
						{@const nameErr = rowError(i, 'name')}
						{@const valueErr = rowError(i, 'value')}
						{@const amount = preview?.amounts[i] ?? null}
						<div class="panel grid grid-cols-2 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_minmax(0,1.3fr)_auto_auto] sm:items-start">
							<div class="col-span-2 sm:col-span-1">
								<input
									class={inputClass}
									aria-label="Nama termin {i + 1}"
									placeholder="Nama termin"
									bind:value={row.name}
									aria-invalid={nameErr ? 'true' : undefined}
									aria-describedby={nameErr ? `arap-term-${i}-name-error` : undefined}
									onblur={() => touchRow(i, 'name')}
								/>
								{#if nameErr}<p id="arap-term-{i}-name-error" role="alert" class="mt-1 text-xs font-medium text-destructive">{nameErr}</p>{/if}
							</div>
							<SimpleSelect
								aria-label="Jenis nilai termin {i + 1}"
								bind:value={row.mode}
								options={[
									{ value: 'percent', label: '%' },
									{ value: 'amount', label: 'Nominal' }
								]}
							/>
							<div>
								<input
									class="{inputClass} text-right"
									inputmode="decimal"
									placeholder={row.mode === 'percent' ? '0 %' : '0'}
									aria-label="{row.mode === 'percent' ? 'Persentase' : 'Nominal'} termin {i + 1}"
									bind:value={row.value}
									aria-invalid={valueErr ? 'true' : undefined}
									aria-describedby={valueErr ? `arap-term-${i}-value-error` : undefined}
									onblur={() => touchRow(i, 'value')}
								/>
								{#if valueErr}<p id="arap-term-{i}-value-error" role="alert" class="mt-1 text-right text-xs font-medium text-destructive">{valueErr}</p>
								{:else if amount && row.mode === 'percent'}<p class="mt-1 text-right text-xs text-muted-foreground tabular-nums">{money(amount)}</p>{/if}
							</div>
							<div class="col-span-2 sm:col-span-1">
								<SearchSelect
									aria-label="{COPY.doc} termin {i + 1}"
									bind:value={row.documentId}
									options={rowOptions(i)}
									placeholder={NONE.label}
									searchPlaceholder={COPY.docSearch}
									emptyText="Tidak ada dokumen yang cocok"
								/>
							</div>
							<label class="flex h-10 items-center gap-2 text-sm">
								<input type="checkbox" role="switch" class="size-4 accent-primary" bind:checked={row.paid} aria-label="Termin {i + 1} lunas" />
								Lunas
							</label>
							<div class="flex justify-end">
								<Button type="button" variant="ghost" size="icon-sm" class="mt-1.5" aria-label="Hapus termin {i + 1}" disabled={rows.length <= 2} onclick={() => removeRow(i)}>
									<Trash2 class="size-4" />
								</Button>
							</div>
						</div>
					{/each}
				</div>
				<Button type="button" variant="outline" onclick={addRow}>+ Tambah termin</Button>

				{#if preview}
					<div class="flex flex-col items-end gap-1 text-sm">
						<div class="flex w-full max-w-72 justify-between"><span class="text-muted-foreground">Jumlah termin</span><span class="tabular-nums">{money(preview.sum)}</span></div>
						<div class="flex w-full max-w-72 justify-between"><span class="text-muted-foreground">Total</span><span class="tabular-nums">{money(toMoney(form.values.total.trim()))}</span></div>
						<div class="flex w-full max-w-72 justify-between font-semibold"><span>Sisa</span><span class="tabular-nums">{money(preview.remaining)}</span></div>
						{#if preview.error}<p class="text-xs font-medium text-destructive">{preview.error}</p>{/if}
					</div>
				{/if}
			{/if}

			{#if mismatched.length > 0}
				<Alert.Root class="border-amber/50 bg-amber/10 text-foreground">
					<TriangleAlert class="text-amber-600" />
					<Alert.Description>
						Mata uang dokumen berbeda dengan entri ({form.values.currency}): {mismatched.map((d) => `${d.no} (${d.currency})`).join(', ')}. Tetap bisa disimpan.
					</Alert.Description>
				</Alert.Root>
			{/if}

			{#if errorMessage}
				<Alert.Root variant="destructive">
					<Alert.Title>Gagal menyimpan</Alert.Title>
					<Alert.Description>{errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}

			<Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
		</form>
	</Card.Content>
</Card.Root>
