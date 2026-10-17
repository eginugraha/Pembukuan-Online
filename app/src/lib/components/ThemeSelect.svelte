<script lang="ts">
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { onMount } from 'svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import { applyTheme, DEFAULT_THEME, readTheme, type ThemeMode } from '$lib/theme';

	/** compact: trigger berupa ikon saja di semua ukuran layar (mis. halaman login). */
	let { compact = false }: { compact?: boolean } = $props();

	const OPTIONS = [
		{ value: 'light', label: 'Terang', icon: Sun },
		{ value: 'dark', label: 'Gelap', icon: Moon },
		{ value: 'system', label: 'Sistem', icon: Monitor }
	];

	let mode = $state<ThemeMode>(DEFAULT_THEME);
	onMount(() => {
		mode = readTheme();
		// Pasang pendengar "Sistem" setelah reload (skrip inline hanya memasang kelas awal).
		if (mode === 'system') applyTheme(mode);
	});
</script>

<SimpleSelect
	bind:value={mode}
	options={OPTIONS}
	aria-label="Tema"
	class="w-auto min-w-0 {compact ? 'w-10 justify-center px-0' : 'max-sm:w-10 max-sm:justify-center max-sm:px-0 sm:w-36'} [&>svg:last-child]:hidden {compact ? '' : 'sm:[&>svg:last-child]:block'}"
	onchange={(v) => applyTheme(v as ThemeMode)}
>
	{#snippet display()}
		<!-- Ketiga varian dirender; CSS memilih satu berdasarkan <html data-theme>, jadi benar sejak render pertama. -->
		<span class="flex min-w-0 flex-1 items-center gap-2 justify-center {compact ? '' : 'sm:justify-start'} [html[data-theme=light]_&]:hidden [html[data-theme=system]_&]:hidden">
			<Moon class="size-4 shrink-0" /><span class={compact ? 'sr-only' : 'max-sm:sr-only'}>Gelap</span>
		</span>
		<span class="hidden min-w-0 flex-1 items-center gap-2 justify-center {compact ? '' : 'sm:justify-start'} [html[data-theme=light]_&]:flex">
			<Sun class="size-4 shrink-0" /><span class={compact ? 'sr-only' : 'max-sm:sr-only'}>Terang</span>
		</span>
		<span class="hidden min-w-0 flex-1 items-center gap-2 justify-center {compact ? '' : 'sm:justify-start'} [html[data-theme=system]_&]:flex">
			<Monitor class="size-4 shrink-0" /><span class={compact ? 'sr-only' : 'max-sm:sr-only'}>Sistem</span>
		</span>
	{/snippet}
</SimpleSelect>
