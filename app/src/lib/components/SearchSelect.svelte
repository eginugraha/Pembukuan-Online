<script lang="ts" module>
	export interface SearchOption {
		value: string;
		label: string;
		/** Ditampilkan sebagai label kecil di kiri, ikut dicari (mis. kode akun). */
		code?: string;
		/** Judul kelompok (mis. tipe akun); opsi dengan group sama dikelompokkan berurutan. */
		group?: string;
	}
</script>

<script lang="ts">
	// onblur dipanggil saat field benar-benar ditinggalkan: panel ditutup, atau Tab melewati tombol
	// tanpa membuka panel. Fokus yang pindah ke panel tidak dihitung (agar validasi tidak muncul saat memilih).
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Search from '@lucide/svelte/icons/search';
	import { Command, Popover } from 'bits-ui';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		value = $bindable(''),
		options,
		placeholder = 'Pilih…',
		searchPlaceholder = 'Cari…',
		emptyText = 'Tidak ada yang cocok',
		name,
		class: className,
		onchange,
		onblur,
		...rest
	}: {
		value?: string;
		options: SearchOption[];
		placeholder?: string;
		searchPlaceholder?: string;
		emptyText?: string;
		/** Bila diisi, nilai ikut terkirim pada submit form biasa (input hidden). */
		name?: string;
		class?: string;
		onchange?: (value: string) => void;
	} & Omit<HTMLButtonAttributes, 'value' | 'onchange' | 'class'> = $props();

	let open = $state(false);
	let query = $state('');
	const listId = $props.id();

	const selected = $derived(options.find((o) => o.value === value));
	// Pencarian substring (bukan fuzzy) pada kode dan nama, tanpa membedakan huruf besar/kecil.
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return q ? options.filter((o) => `${o.code ?? ''} ${o.label}`.toLowerCase().includes(q)) : options;
	});
	const groups = $derived.by(() => {
		const out: { heading: string | undefined; items: SearchOption[] }[] = [];
		for (const o of filtered) {
			const last = out.at(-1);
			if (last && last.heading === o.group) last.items.push(o);
			else out.push({ heading: o.group, items: [o] });
		}
		return out;
	});

	/** Pecah teks menjadi bagian biasa & bagian yang cocok dengan pencarian (untuk disorot). */
	function parts(text: string): { t: string; hit: boolean }[] {
		const q = query.trim();
		if (!q) return [{ t: text, hit: false }];
		const i = text.toLowerCase().indexOf(q.toLowerCase());
		if (i < 0) return [{ t: text, hit: false }];
		return [
			{ t: text.slice(0, i), hit: false },
			{ t: text.slice(i, i + q.length), hit: true },
			{ t: text.slice(i + q.length), hit: false }
		].filter((p) => p.t);
	}

	function choose(v: string) {
		value = v;
		open = false;
		onchange?.(v);
	}
	$effect(() => {
		if (!open) query = '';
	});
</script>

{#if name}<input type="hidden" {name} {value} />{/if}

<Popover.Root bind:open onOpenChange={(o) => !o && onblur?.(new FocusEvent('blur') as never)}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				{...rest}
				type="button"
				role="combobox"
				aria-expanded={open}
				aria-haspopup="listbox"
				aria-controls={listId}
				onblur={(e) => !open && onblur?.(e as never)}
				class={cn(
					'dropdown-trigger flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-input bg-field pr-3 pl-3 text-left text-sm shadow-[0_2px_8px_-6px_rgb(20_33_15/0.25)] transition-[border-color,box-shadow] outline-none focus-visible:border-green focus-visible:ring-3 focus-visible:ring-green/25 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[state=open]:border-green data-[state=open]:ring-3 data-[state=open]:ring-green/25',
					className
				)}
			>
				{#if selected}
					{#if selected.code}<span class="shrink-0 text-xs text-muted-foreground tabular-nums">{selected.code}</span>{/if}
					<span class="min-w-0 flex-1 truncate">{selected.label}</span>
				{:else}
					<span class="min-w-0 flex-1 truncate text-muted-foreground">{placeholder}</span>
				{/if}
				<ChevronDown class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 {open ? 'rotate-180' : ''}" />
			</button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			sideOffset={6}
			align="start"
			class="dropdown-panel z-[60] w-[max(var(--bits-popover-anchor-width),18rem)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_24px_48px_-20px_rgb(0_0_0/0.45)]"
		>
			<Command.Root shouldFilter={false} loop>
				<div class="flex items-center gap-2 border-b border-border px-3">
					<Search class="size-4 shrink-0 text-muted-foreground" />
					<Command.Input bind:value={query} placeholder={searchPlaceholder} class="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
					{#if query}<span class="shrink-0 text-xs text-muted-foreground">{filtered.length} hasil</span>{/if}
				</div>
				<Command.List id={listId} class="max-h-72 overflow-y-auto overscroll-contain p-1.5">
					{#if filtered.length === 0}
						<p class="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
					{/if}
					{#each groups as g, gi (gi)}
						<Command.Group>
							{#if g.heading}
								<Command.GroupHeading class="px-2.5 pt-2.5 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{g.heading}</Command.GroupHeading>
							{/if}
							<Command.GroupItems>
								{#each g.items as o (o.value)}
									<Command.Item
										value={o.value || '__empty__'}
										onSelect={() => choose(o.value)}
										class="group/opt flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm outline-none data-selected:bg-pale"
									>
										{#if o.code}
											<span class="min-w-14 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-center text-[11px] text-muted-foreground tabular-nums group-data-selected/opt:text-deep">
												{#each parts(o.code) as p, pi (pi)}{#if p.hit}<mark class="bg-transparent font-bold text-deep">{p.t}</mark>{:else}{p.t}{/if}{/each}
											</span>
										{/if}
										<span class="min-w-0 flex-1 truncate">
											{#each parts(o.label) as p, pi (pi)}{#if p.hit}<mark class="bg-transparent font-bold text-deep">{p.t}</mark>{:else}{p.t}{/if}{/each}
										</span>
										{#if o.value === value}<Check class="size-4 shrink-0 text-deep" aria-label="Terpilih" />{/if}
									</Command.Item>
								{/each}
							</Command.GroupItems>
						</Command.Group>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
