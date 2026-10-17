<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { Crumb } from '$lib/breadcrumb';

	let { items }: { items: Crumb[] } = $props();
</script>

<nav aria-label="Breadcrumb">
	<ol class="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
		{#each items as c, i (i)}
			{@const last = i === items.length - 1}
			{#if i > 0}
				<li aria-hidden="true" class="shrink-0"><ChevronRight class="size-3" aria-hidden="true" /></li>
			{/if}
			<li class="min-w-0 {last ? '' : 'shrink'}">
				{#if last}
					<span aria-current="page" class="block truncate text-ink">{c.label}</span>
				{:else if c.href}
					<a href={c.href} class="block max-w-[10rem] truncate hover:text-deep">{c.label}</a>
				{:else}
					<span class="block max-w-[10rem] truncate">{c.label}</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
