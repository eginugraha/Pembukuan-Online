<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import BookUser from '@lucide/svelte/icons/book-user';
	import BookText from '@lucide/svelte/icons/book-text';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import FileText from '@lucide/svelte/icons/file-text';
	import History from '@lucide/svelte/icons/history';
	import Landmark from '@lucide/svelte/icons/landmark';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Library from '@lucide/svelte/icons/library';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import ListTree from '@lucide/svelte/icons/list-tree';
	import Lock from '@lucide/svelte/icons/lock';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import Receipt from '@lucide/svelte/icons/receipt';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import Scale from '@lucide/svelte/icons/scale';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Settings from '@lucide/svelte/icons/settings';
	import ShieldUser from '@lucide/svelte/icons/shield-user';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import Upload from '@lucide/svelte/icons/upload';
	import Users from '@lucide/svelte/icons/users';
	import Wallet from '@lucide/svelte/icons/wallet';
	import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
	import { Tooltip } from 'bits-ui';
	import { onMount, untrack, type Component } from 'svelte';
	import { readClosedGroups, saveClosedGroups } from '$lib/sidebar';
	import NextStepCard from '$lib/components/NextStepCard.svelte';
	import type { NavGroup } from '$lib/nav';
	import type { NextStep } from '$lib/server/dashboard/next-step';

	let {
		nav,
		isActive,
		nextStep,
		onnavigate,
		collapsed = false
	}: {
		nav: NavGroup[];
		isActive: (href: string) => boolean;
		nextStep: NextStep | null;
		onnavigate?: () => void;
		/** Mode ikon saja (sidebar desktop). Tampilan pra-hydrate diatur CSS varian `rail-collapsed`. */
		collapsed?: boolean;
	} = $props();

	let navEl = $state<HTMLElement | null>(null);
	let indicator = $state<{ top: number; height: number } | null>(null);
	let animate = $state(false);
	const activeHref = $derived(nav.flatMap((g) => g.items).find((i) => isActive(i.href))?.href ?? null);
	const activeGroup = $derived(nav.find((g) => g.items.some((i) => i.href === activeHref))?.label ?? null);

	// Grup bertajuk bisa dibuka/ditutup sendiri-sendiri; pilihannya diingat di browser.
	let closed = $state<string[]>([]);
	onMount(() => (closed = readClosedGroups()));
	const isClosed = (label: string | null) => label !== null && !collapsed && closed.includes(label);
	// Menu aktif yang tersembunyi di grup tertutup tidak diberi indikator.
	const activeHidden = $derived(isClosed(activeGroup));

	// Hanya satu grup yang terbuka: membuka grup menutup grup lain.
	const groupLabels = $derived(nav.flatMap((g) => (g.label ? [g.label] : [])));
	const onlyOpen = (label: string) => groupLabels.filter((l) => l !== label);

	// Pindah ke halaman di grup yang tertutup membukanya, dan menutup grup lain.
	$effect(() => {
		const label = activeGroup;
		if (label && untrack(() => closed.includes(label))) closed = onlyOpen(label);
	});

	function toggleGroup(label: string) {
		closed = closed.includes(label) ? onlyOpen(label) : [...closed, label];
		saveClosedGroups(closed);
		// Menu di bawah grup ini bergeser selama animasi, jadi indikator diukur ulang tiap frame.
		const until = performance.now() + 260;
		animate = false;
		const tick = () => {
			measure();
			if (performance.now() < until) requestAnimationFrame(tick);
			else animate = true;
		};
		requestAnimationFrame(tick);
	}

	function measure() {
		const el = navEl?.querySelector<HTMLElement>('[aria-current="page"]');
		indicator = el ? { top: el.offsetTop, height: el.offsetHeight } : null;
	}

	// Satu indikator aktif di bawah teks menu, digeser dengan transisi CSS ke menu yang aktif.
	$effect(() => {
		void activeHref;
		void collapsed; // posisi berubah saat label grup disembunyikan/ditampilkan
		const el = navEl?.querySelector<HTMLElement>('[aria-current="page"]');
		// Hanya menulis state di sini (tidak membacanya) agar effect tidak memicu dirinya sendiri.
		const next = el ? { top: el.offsetTop, height: el.offsetHeight } : null;
		// Menu aktif yang berada di luar area scroll sidebar digulir agar terlihat.
		el?.scrollIntoView({ block: 'nearest' });
		indicator = next;
		// Posisi pertama dipasang tanpa animasi agar tidak meluncur dari atas saat halaman dibuka.
		if (next && !untrack(() => animate)) requestAnimationFrame(() => (animate = true));
	});

	const GROUP_ICONS: Record<string, Component<{ class?: string }>> = {
		estatement: FileText,
		journalGroup: NotebookPen,
		books: BookText,
		invoicing: ReceiptText,
		reports: ChartColumn,
		settings: Settings,
		rbac: ShieldCheck
	};
	const ICONS: Record<string, Component<{ class?: string }>> = {
		dashboard: LayoutDashboard,
		upload: Upload,
		history: History,
		review: ListChecks,
		journal: BookOpen,
		ledger: Library,
		scale: Scale,
		landmark: Landmark,
		income: TrendingUp,
		company: Building2,
		users: Users,
		systemUsers: ShieldUser,
		accounts: ListTree,
		rules: WandSparkles,
		wallet: Wallet,
		closing: Lock,
		contacts: BookUser,
		invoice: Receipt,
		po: ShoppingCart
	};
</script>

<div class="flex h-full flex-col px-4 py-5 rail-collapsed:px-2">
	<a href="/dashboard" onclick={onnavigate} aria-label="Pembukuan Online" title="Pembukuan Online — Pembukuan Keuangan" class="mb-4 flex shrink-0 items-center gap-2.5 px-2 text-base font-extrabold tracking-tight text-green rail-collapsed:justify-center rail-collapsed:px-0">
		<span class="icon-tile icon-tile-deep size-9 shrink-0 rounded-xl font-black">P</span>
		<span class="truncate rail-collapsed:hidden">Pembukuan Online</span>
	</a>

	<Tooltip.Provider>
	<nav bind:this={navEl} class="relative -mx-4 min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-2 rail-collapsed:-mx-2 rail-collapsed:px-2" aria-label="Menu utama">
		{#if indicator && !activeHidden}
			<span
				class="nav-indicator pointer-events-none absolute inset-x-4 top-0 rounded-xl bg-pale rail-collapsed:inset-x-2 {animate ? 'is-animated' : ''}"
				style:transform="translateY({indicator.top}px)"
				style:height="{indicator.height}px"
				aria-hidden="true"
			>
				<span class="absolute top-1.5 bottom-1.5 -left-4 w-1 rounded-r bg-green rail-collapsed:-left-2"></span>
			</span>
		{/if}
		{#snippet items(group: NavGroup)}
			{#each group.items as item (item.href)}
				{@const Icon = ICONS[item.icon] ?? LayoutDashboard}
				{@const active = isActive(item.href)}
				<Tooltip.Root disabled={!collapsed} delayDuration={150}>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<a
								{...props}
								href={item.href}
								onclick={onnavigate}
								aria-label={item.label}
								aria-describedby={undefined}
								aria-current={active ? 'page' : undefined}
								class="group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors duration-200 hover:bg-pale/50 rail-collapsed:justify-center rail-collapsed:px-0 {group.label ? 'pl-5 rail-collapsed:pl-0' : ''} {active
									? 'font-semibold text-deep'
									: 'text-ink/65 hover:text-deep'}"
							>
								<span class="relative flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 {active ? 'icon-tile icon-tile-solid' : 'bg-muted text-ink/55 group-hover:text-deep'}">
									<Icon class="size-4" />
								</span>
								<span class="relative min-w-0 flex-1 truncate rail-collapsed:hidden">{item.label}</span>
							</a>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Portal>
						<Tooltip.Content role="tooltip" side="right" sideOffset={10} class="z-[60] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg">
							{item.label}
						</Tooltip.Content>
					</Tooltip.Portal>
				</Tooltip.Root>
			{/each}
		{/snippet}
		{#each nav as group, gi (gi)}
			{#if group.label}
				{@const shut = isClosed(group.label)}
				<button
					type="button"
					onclick={() => toggleGroup(group.label!)}
					aria-expanded={!shut}
					aria-controls="nav-group-{gi}"
					class="flex w-full items-center justify-between rounded-xl px-2.5 pt-3 pb-1 text-left text-sm font-bold text-ink/70 transition-colors hover:text-deep rail-collapsed:hidden"
				>
					<span class="flex items-center gap-3">
						<!-- Kolom ikon selebar ubin ikon menu (size-7) agar ikon dan teks judul sejajar dengan menu di bawahnya. -->
						<span class="flex size-7 shrink-0 items-center justify-center">
							{#if group.icon && GROUP_ICONS[group.icon]}
								{@const GroupIcon = GROUP_ICONS[group.icon]}
								<GroupIcon class="size-4 text-green" />
							{/if}
						</span>
						{group.label}
					</span>
					<ChevronDown class="size-3.5 transition-transform duration-200 {shut ? '-rotate-90' : ''}" />
				</button>
				<!-- Tinggi dianimasikan lewat grid 0fr↔1fr; mode ikon selalu menampilkan semua menu. -->
				<div id="nav-group-{gi}" class="grid transition-[grid-template-rows,visibility] duration-200 {shut ? 'invisible grid-rows-[0fr]' : 'grid-rows-[1fr]'} rail-collapsed:visible rail-collapsed:grid-rows-[1fr]" inert={shut}>
					<div class="min-h-0 space-y-1 overflow-hidden rail-collapsed:overflow-visible">
						{@render items(group)}
					</div>
				</div>
			{:else}
				{@render items(group)}
			{/if}
		{/each}
	</nav>
	</Tooltip.Provider>

	<!-- Bagian bawah tetap terlihat; hanya daftar menu di atasnya yang scroll. -->
	<div class="shrink-0">
		{#if nextStep}
			<div class="rail-collapsed:hidden"><NextStepCard step={nextStep} {onnavigate} /></div>
		{/if}
	</div>
</div>
