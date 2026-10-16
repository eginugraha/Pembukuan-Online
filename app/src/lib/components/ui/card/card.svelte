<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = "default",
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { size?: "default" | "sm" } = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	data-size={size}
	class={cn("bg-card text-card-foreground gap-(--card-spacing) overflow-hidden rounded-[20px] py-(--card-spacing) text-sm shadow-[0_1px_2px_rgb(20_33_15/0.04),0_18px_40px_-28px_rgb(30_60_25/0.35)] [--card-spacing:--spacing(6)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-[20px] *:[img:last-child]:rounded-b-[20px] group/card flex flex-col", className)}
	{...restProps}
>
	{@render children?.()}
</div>
