<script lang="ts">
	// onblur dipanggil saat field benar-benar ditinggalkan: panel ditutup, atau Tab melewati tombol
	// tanpa membuka panel. Fokus yang pindah ke panel tidak dihitung (agar validasi tidak muncul saat memilih).
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { Select } from 'bits-ui';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		value = $bindable(''),
		options,
		placeholder = 'Pilih…',
		name,
		class: className,
		onchange,
		onblur,
		...rest
	}: {
		value?: string;
		options: { value: string; label: string }[];
		placeholder?: string;
		name?: string;
		class?: string;
		onchange?: (value: string) => void;
	} & Omit<HTMLButtonAttributes, 'value' | 'onchange' | 'class'> = $props();

	let open = $state(false);
	const selected = $derived(options.find((o) => o.value === value));
</script>

<Select.Root type="single" bind:value items={options} {name} bind:open onValueChange={(v) => onchange?.(v)} onOpenChange={(o) => !o && onblur?.(new FocusEvent('blur') as never)}>
	<Select.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				{...rest}
				type="button"
				onblur={(e) => !open && onblur?.(e as never)}
				class={cn(
					'dropdown-trigger group flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-input bg-field pr-3 pl-3 text-left text-sm shadow-[0_2px_8px_-6px_rgb(20_33_15/0.25)] transition-[border-color,box-shadow] outline-none focus-visible:border-green focus-visible:ring-3 focus-visible:ring-green/25 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[state=open]:border-green data-[state=open]:ring-3 data-[state=open]:ring-green/25',
					className
				)}
			>
				<span class="min-w-0 flex-1 truncate {selected ? '' : 'text-muted-foreground'}">{selected?.label ?? placeholder}</span>
				<ChevronDown class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
			</button>
		{/snippet}
	</Select.Trigger>
	<Select.Portal>
		<Select.Content
			sideOffset={6}
			class="dropdown-panel z-[60] max-h-72 w-[max(var(--bits-select-anchor-width),10rem)] overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_24px_48px_-20px_rgb(0_0_0/0.45)]"
		>
			<Select.Viewport>
				{#each options as o (o.value)}
					<Select.Item value={o.value} label={o.label} class="flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm outline-none data-highlighted:bg-pale">
						{#snippet children({ selected: isSel })}
							<span class="min-w-0 flex-1 truncate">{o.label}</span>
							{#if isSel}<Check class="size-4 shrink-0 text-deep" aria-hidden="true" />{/if}
						{/snippet}
					</Select.Item>
				{/each}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>
