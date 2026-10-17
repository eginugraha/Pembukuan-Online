<script lang="ts">
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { onMount, type Component } from 'svelte';
	import { applyTheme, DEFAULT_THEME, readTheme, type ThemeMode } from '$lib/theme';

	/** compact: selalu satu tombol ikon (mis. di halaman login). */
	let { compact = false }: { compact?: boolean } = $props();

	const OPTIONS: { mode: ThemeMode; label: string; icon: Component<{ class?: string }> }[] = [
		{ mode: 'light', label: 'Terang', icon: Sun },
		{ mode: 'dark', label: 'Gelap', icon: Moon },
		{ mode: 'system', label: 'Sistem', icon: Monitor }
	];

	let mode = $state<ThemeMode>(DEFAULT_THEME);
	onMount(() => {
		mode = readTheme();
		// Pasang ulang listener "Sistem" setelah reload (skrip inline hanya memasang class awal).
		if (mode === 'system') applyTheme(mode);
	});

	function choose(next: ThemeMode) {
		mode = next;
		applyTheme(next);
	}
	const current = $derived(OPTIONS.find((o) => o.mode === mode) ?? OPTIONS[1]);
	const cycle = () => choose(OPTIONS[(OPTIONS.indexOf(current) + 1) % OPTIONS.length].mode);
</script>

{#if !compact}
	<div role="radiogroup" aria-label="Tema" class="hidden items-center gap-0.5 rounded-xl border border-border bg-card p-1 sm:flex">
		{#each OPTIONS as o (o.mode)}
			<button
				type="button"
				role="radio"
				aria-checked={mode === o.mode}
				title={o.label}
				onclick={() => choose(o.mode)}
				class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors {mode === o.mode
					? 'bg-pale text-deep'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<o.icon class="size-3.5" /><span class="hidden xl:inline">{o.label}</span><span class="sr-only xl:hidden">{o.label}</span>
			</button>
		{/each}
	</div>
{/if}
<button
	type="button"
	onclick={cycle}
	aria-label="Tema: {current.label}. Ganti tema"
	title="Tema: {current.label}"
	class="icon-tile icon-tile-muted size-10 shrink-0 {compact ? '' : 'sm:hidden'}"
>
	<current.icon class="size-[18px]" />
</button>
