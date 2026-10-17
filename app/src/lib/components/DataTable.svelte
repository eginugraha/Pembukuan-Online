<script lang="ts" generics="T">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Search from '@lucide/svelte/icons/search';
	import type { Snippet } from 'svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import * as Table from '$lib/components/ui/table/index.js';
	import { nextSort, view, type Column, type SortState } from '$lib/table';
	import { cn } from '$lib/utils';

	let {
		rows,
		columns,
		rowKey,
		cell,
		searchPlaceholder = 'Cari…',
		emptyText = 'Belum ada data.',
		sortable = true,
		rowClass
	}: {
		rows: T[];
		columns: Column<T>[];
		rowKey: (row: T) => string;
		/** Isi sel; dipakai untuk sel berisi aksi, badge, dsb. */
		cell: Snippet<[T, Column<T>]>;
		searchPlaceholder?: string;
		emptyText?: string;
		/** false = urut kolom dimatikan untuk semua kolom (mis. tabel berbentuk pohon). */
		sortable?: boolean;
		rowClass?: (row: T) => string;
	} = $props();

	const PAGE_SIZES = [10, 25, 50];
	let query = $state('');
	let sort = $state<SortState>(null);
	let page = $state(1);
	let pageSize = $state('10');

	const v = $derived(view(rows, columns, { query, sort, page, pageSize: Number(pageSize) }));
	// Halaman yang dijepit oleh view (mis. setelah baris terakhir halaman dihapus) disimpan kembali.
	$effect(() => {
		if (v.page !== page) page = v.page;
	});

	const canSort = (c: Column<T>) => sortable && !!c.sortable;
	const ariaSort = (c: Column<T>) => (!canSort(c) ? undefined : sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');

	/** Nomor halaman ringkas: 1 … (sekitar halaman aktif) … terakhir. */
	const pages = $derived.by(() => {
		const n = v.pageCount;
		const set = new Set([1, n, v.page - 1, v.page, v.page + 1].filter((p) => p >= 1 && p <= n));
		const sorted = [...set].sort((a, b) => a - b);
		const out: (number | '…')[] = [];
		for (const p of sorted) {
			const last = out.at(-1);
			if (typeof last === 'number' && p - last > 1) out.push('…');
			out.push(p);
		}
		return out;
	});
</script>

<div class="panel overflow-hidden">
	<div class="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5">
		<label class="relative min-w-0 flex-1 sm:max-w-xs">
			<span class="sr-only">Cari</span>
			<Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
			<input
				type="search"
				bind:value={query}
				oninput={() => (page = 1)}
				placeholder={searchPlaceholder}
				class="h-9 w-full rounded-xl border border-input bg-field pr-3 pl-9 text-sm outline-none focus-visible:border-green focus-visible:ring-3 focus-visible:ring-green/25"
			/>
		</label>
		<span class="ml-auto text-xs text-muted-foreground tabular-nums">
			{v.filtered === v.total ? `${v.total} baris` : `${v.filtered} dari ${v.total} baris`}
		</span>
	</div>

	<div class="px-2">
		<Table.Root>
			<Table.Header>
				<Table.Row class="hover:bg-transparent">
					{#each columns as c (c.key)}
						<Table.Head aria-sort={ariaSort(c)} class={cn(c.align === 'right' && 'text-right')}>
							{#if canSort(c)}
								<button
									type="button"
									onclick={() => (sort = nextSort(sort, c.key))}
									class="inline-flex items-center gap-1 rounded-md py-0.5 transition-colors hover:text-foreground {sort?.key === c.key ? 'text-deep' : ''} {c.align === 'right' ? 'flex-row-reverse' : ''}"
								>
									{c.label}
									{#if sort?.key === c.key}
										{#if sort.dir === 'asc'}<ArrowUp class="size-3" />{:else}<ArrowDown class="size-3" />{/if}
									{:else}
										<ArrowUpDown class="size-3 opacity-40" />
									{/if}
								</button>
							{:else}
								{c.label}
							{/if}
						</Table.Head>
					{/each}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each v.rows as row (rowKey(row))}
					<Table.Row class={rowClass?.(row)}>
						{#each columns as c (c.key)}
							<Table.Cell class={cn(c.align === 'right' && 'text-right tabular-nums')}>{@render cell(row, c)}</Table.Cell>
						{/each}
					</Table.Row>
				{/each}
				{#if v.rows.length === 0}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={columns.length} class="py-10 text-center text-muted-foreground">
							{query.trim() ? 'Tidak ada data yang cocok' : emptyText}
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</div>

	<div class="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
		<div class="flex items-center gap-2">
			<SimpleSelect
				class="h-8 w-20"
				bind:value={pageSize}
				options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
				aria-label="Baris per halaman"
				onchange={() => (page = 1)}
			/>
			<span>per halaman</span>
		</div>
		<span data-testid="datatable-range" class="tabular-nums">{v.from}–{v.to} dari {v.filtered}</span>
		<nav class="ml-auto flex items-center gap-1" aria-label="Paginasi">
			<button type="button" class="pg-btn" aria-label="Halaman sebelumnya" disabled={v.page <= 1} onclick={() => (page = v.page - 1)}>
				<ChevronLeft class="size-4" />
			</button>
			{#each pages as p, i (i)}
				{#if p === '…'}
					<span class="px-1" aria-hidden="true">…</span>
				{:else}
					<button
						type="button"
						class="pg-btn tabular-nums {p === v.page ? 'border-transparent bg-pale font-semibold text-deep' : ''}"
						aria-label="Halaman {p}"
						aria-current={p === v.page ? 'page' : undefined}
						onclick={() => (page = p)}>{p}</button
					>
				{/if}
			{/each}
			<button type="button" class="pg-btn" aria-label="Halaman berikutnya" disabled={v.page >= v.pageCount} onclick={() => (page = v.page + 1)}>
				<ChevronRight class="size-4" />
			</button>
		</nav>
	</div>
</div>

<style>
	.pg-btn {
		display: inline-flex;
		min-width: 2rem;
		height: 2rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.6rem;
		border: 1px solid var(--border);
		padding: 0 0.5rem;
		transition: background-color 150ms;
	}
	.pg-btn:hover:not(:disabled) {
		background: var(--pale);
		color: var(--deep);
	}
	.pg-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
