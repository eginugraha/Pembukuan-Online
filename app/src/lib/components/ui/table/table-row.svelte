<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>> = $props();
</script>

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn("hover:bg-pale/60 data-[state=selected]:bg-pale border-b border-border/70 transition-colors has-aria-expanded:bg-muted/50", className)}
	{...restProps}
>
	{@render children?.()}
</tr>
