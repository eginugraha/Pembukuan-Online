<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { NAV } from '$lib/nav';
	import { buildBreadcrumb } from '$lib/breadcrumb';
	import Breadcrumb from './Breadcrumb.svelte';

	let {
		title,
		description,
		actions,
		crumb,
		logoUrl
	}: { title: string; description?: string; actions?: Snippet; crumb?: string; logoUrl?: string | null } = $props();

	const items = $derived(page.url.pathname === '/dashboard' ? [] : buildBreadcrumb(page.url.pathname, NAV, crumb));
</script>

<svelte:head><title>{title} · pena</title></svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
	<div class="min-w-0">
		{#if items.length > 0}
			<div class="mb-3"><Breadcrumb {items} /></div>
		{/if}
		<div class="flex items-center gap-3">
			{#if logoUrl}
				<img src={logoUrl} alt="Logo perusahaan" class="size-10 rounded-lg bg-chip-fixed p-1 object-contain" />
			{/if}
			<h1 class="text-2xl font-bold tracking-tight text-ink">{title}</h1>
		</div>
		{#if description}
			<p class="mt-1 text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
	{/if}
</div>
