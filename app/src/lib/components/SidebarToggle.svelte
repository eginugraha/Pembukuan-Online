<script lang="ts">
	import ChevronsLeft from '@lucide/svelte/icons/chevrons-left';
	import ChevronsRight from '@lucide/svelte/icons/chevrons-right';

	let { collapsed, ontoggle }: { collapsed: boolean; ontoggle: () => void } = $props();
</script>

<!-- Ikon dipilih CSS dari <html data-sidebar>, jadi arahnya benar sejak render pertama (sebelum JS berjalan). -->
<button
	type="button"
	onclick={ontoggle}
	aria-label={collapsed ? 'Lebarkan sidebar' : 'Ciutkan sidebar'}
	aria-expanded={!collapsed}
	aria-controls="app-sidebar"
	title={collapsed ? 'Lebarkan sidebar' : 'Ciutkan sidebar'}
	class="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-pale hover:text-deep lg:flex"
>
	<ChevronsLeft class="size-4 sb-collapsed:hidden" />
	<ChevronsRight class="hidden size-4 sb-collapsed:block" />
</button>
