<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import History from '@lucide/svelte/icons/history';
	import Landmark from '@lucide/svelte/icons/landmark';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Lock from '@lucide/svelte/icons/lock';
	import Library from '@lucide/svelte/icons/library';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import ListTree from '@lucide/svelte/icons/list-tree';
	import Scale from '@lucide/svelte/icons/scale';
	import Upload from '@lucide/svelte/icons/upload';
	import Users from '@lucide/svelte/icons/users';
	import Wallet from '@lucide/svelte/icons/wallet';
	import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
	import { Tooltip } from 'bits-ui';
	import { untrack, type Component } from 'svelte';
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

	// Satu indikator aktif di bawah teks menu, digeser dengan transisi CSS ke menu yang aktif.
	let navEl = $state<HTMLElement | null>(null);
	let indicator = $state<{ top: number; height: number } | null>(null);
	let animate = $state(false);
	const activeHref = $derived(nav.flatMap((g) => g.items).find((i) => isActive(i.href))?.href ?? null);
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
		accounts: ListTree,
		rules: WandSparkles,
		wallet: Wallet,
		closing: Lock
	};
	const groupLabel = (label: string | null, i: number) => label ?? (i === 0 ? 'Menu Utama' : null);
</script>

<div class="flex h-full flex-col px-4 py-5 rail-collapsed:px-2">
	<a href="/dashboard" onclick={onnavigate} aria-label="Jurnalku" class="mb-4 flex shrink-0 items-center gap-2.5 px-2 text-lg font-extrabold tracking-tight text-green rail-collapsed:justify-center rail-collapsed:px-0">
		<span class="icon-tile icon-tile-deep size-9 shrink-0 rounded-xl font-black">J</span>
		<span class="rail-collapsed:hidden">Jurnalku.</span>
	</a>

	<Tooltip.Provider>
	<nav bind:this={navEl} class="relative -mx-4 min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-2 rail-collapsed:-mx-2 rail-collapsed:px-2" aria-label="Menu utama">
		{#if indicator}
			<span
				class="nav-indicator pointer-events-none absolute inset-x-4 top-0 rounded-xl bg-pale rail-collapsed:inset-x-2 {animate ? 'is-animated' : ''}"
				style:transform="translateY({indicator.top}px)"
				style:height="{indicator.height}px"
				aria-hidden="true"
			>
				<span class="absolute top-1.5 bottom-1.5 -left-4 w-1 rounded-r bg-green rail-collapsed:-left-2"></span>
			</span>
		{/if}
		{#each nav as group, gi (gi)}
			{@const label = groupLabel(group.label, gi)}
			{#if label}
				<p class="px-2 pt-4 pb-1.5 text-[11px] font-semibold text-ink/55 rail-collapsed:hidden">{label}</p>
			{/if}
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
								class="group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors duration-200 rail-collapsed:justify-center rail-collapsed:px-0 {active
									? 'font-semibold text-deep'
									: 'text-ink/65 hover:bg-pale/50 hover:text-deep'}"
							>
								<span class="relative flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 {active ? 'icon-tile icon-tile-solid' : 'bg-muted text-ink/55 group-hover:text-deep'}">
									<Icon class="size-4" />
								</span>
								<span class="relative min-w-0 flex-1 truncate rail-collapsed:hidden">{item.label}</span>
								<ChevronRight class="relative size-3.5 shrink-0 opacity-35 transition-transform duration-200 group-hover:translate-x-0.5 rail-collapsed:hidden" />
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
