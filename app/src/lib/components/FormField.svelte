<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import type { Snippet } from 'svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { cn } from '$lib/utils';

	let {
		id,
		label,
		error,
		hint,
		class: className,
		children
	}: { id: string; label: string; error?: string; hint?: string; class?: string; children: Snippet } = $props();

	// Pada kontrol non-native (mis. kelompok segmen tanggal) <label for> tidak memfokuskan apa pun;
	// arahkan fokus ke elemen interaktif pertama di dalamnya.
	function focusTarget() {
		const el = document.getElementById(id);
		if (!el || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) return;
		el.querySelector<HTMLElement>('[role="spinbutton"], input, button')?.focus();
	}
</script>

<div class={cn('space-y-1.5', className)}>
	<Label for={id} onclick={focusTarget}>{label}</Label>
	{@render children()}
	{#if error}
		<p id="{id}-error" role="alert" class="field-error flex items-start gap-1.5 text-xs font-medium text-destructive">
			<CircleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" /><span>{error}</span>
		</p>
	{:else if hint}
		<p class="text-xs text-muted-foreground">{hint}</p>
	{/if}
</div>
