<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import DateField from '$lib/components/DateField.svelte';
	import FilterActions from '$lib/components/FilterActions.svelte';

	let {
		from,
		to,
		defaults,
		extra,
		extraActive = false
	}: { from: string; to: string; defaults: { from: string; to: string }; extra?: Snippet; extraActive?: boolean } = $props();

	let fromValue = $state(untrack(() => from));
	let toValue = $state(untrack(() => to));
	let error = $state('');
	$effect(() => {
		fromValue = from;
		toValue = to;
		error = '';
	});
	const active = $derived(from !== defaults.from || to !== defaults.to || extraActive);

	function onsubmit(e: SubmitEvent) {
		if (fromValue && toValue && fromValue > toValue) {
			e.preventDefault();
			error = 'Tanggal awal harus sebelum tanggal akhir';
		} else error = '';
	}
</script>

<form method="GET" class="panel mb-5 flex flex-wrap items-end gap-3 p-4" {onsubmit}>
	<div>
		<span class="text-xs font-semibold text-ink/70">Dari</span>
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
	<div><span class="text-xs font-semibold text-ink/70">Sampai</span><DateField name="to" bind:value={toValue} aria-label="Sampai" class="mt-1" /></div>
	{@render extra?.()}
	<FilterActions {active} />
</form>
