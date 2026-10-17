<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { Label } from '$lib/components/ui/label/index.js';
	import DateField from '$lib/components/DateField.svelte';
	import FilterActions from '$lib/components/FilterActions.svelte';

	let {
		from,
		to,
		defaults,
		extra,
		extraActive = false,
		rangeError = null
	}: {
		from: string;
		to: string;
		defaults: { from: string; to: string };
		extra?: Snippet;
		extraActive?: boolean;
		/** Pesan dari server bila rentang di URL tidak valid (form tetap tampil dengan rentang bawaan). */
		rangeError?: string | null;
	} = $props();

	let fromValue = $state(untrack(() => from));
	let toValue = $state(untrack(() => to));
	let error = $state(untrack(() => rangeError ?? ''));
	$effect(() => {
		fromValue = from;
		toValue = to;
		error = rangeError ?? '';
	});
	const active = $derived(from !== defaults.from || to !== defaults.to || extraActive);

	// <label for> tidak memfokuskan kelompok segmen tanggal (bukan kontrol native); arahkan ke segmen pertama.
	function focusFirstSegment(id: string) {
		document.getElementById(id)?.querySelector<HTMLElement>('[role="spinbutton"]')?.focus();
	}

	function onsubmit(e: SubmitEvent) {
		if (fromValue && toValue && fromValue > toValue) {
			e.preventDefault();
			error = 'Tanggal awal harus sebelum tanggal akhir';
		} else error = '';
	}
</script>

<form method="GET" class="panel mb-5 flex flex-wrap items-end gap-3 p-4" {onsubmit}>
	<div>
		<Label for="period-from" class="block text-xs leading-normal font-semibold text-ink/70" onclick={() => focusFirstSegment('period-from')}>Dari</Label>
		<DateField
			name="from"
			bind:value={fromValue}
			id="period-from"
			aria-label="Dari"
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? 'period-from-error' : undefined}
			class="mt-1"
		/>
		{#if error}
			<p id="period-from-error" role="alert" class="field-error mt-1.5 flex items-start gap-1.5 text-xs font-medium text-destructive">
				<CircleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" /><span>{error}</span>
			</p>
		{/if}
	</div>
	<div>
		<Label for="period-to" class="block text-xs leading-normal font-semibold text-ink/70" onclick={() => focusFirstSegment('period-to')}>Sampai</Label>
		<DateField name="to" bind:value={toValue} id="period-to" aria-label="Sampai" class="mt-1" />
	</div>
	{@render extra?.()}
	<FilterActions {active} />
</form>
