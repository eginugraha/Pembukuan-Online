<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import History from '@lucide/svelte/icons/history';
	import Landmark from '@lucide/svelte/icons/landmark';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Library from '@lucide/svelte/icons/library';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import ListTree from '@lucide/svelte/icons/list-tree';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Scale from '@lucide/svelte/icons/scale';
	import Upload from '@lucide/svelte/icons/upload';
	import Users from '@lucide/svelte/icons/users';
	import Wallet from '@lucide/svelte/icons/wallet';
	import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
	import type { Component } from 'svelte';
	import NextStepCard from '$lib/components/NextStepCard.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import type { NavGroup } from '$lib/nav';
	import type { NextStep } from '$lib/server/dashboard/next-step';

	let {
		nav,
		isActive,
		nextStep,
		userName,
		userImage,
		roleLabel,
		onnavigate
	}: {
		nav: NavGroup[];
		isActive: (href: string) => boolean;
		nextStep: NextStep | null;
		userName: string;
		userImage?: string | null;
		roleLabel: string;
		onnavigate?: () => void;
	} = $props();

	// Satu indikator aktif di bawah teks menu, digeser dengan transisi CSS ke menu yang aktif.
	let navEl = $state<HTMLElement | null>(null);
	let indicator = $state<{ top: number; height: number } | null>(null);
	let animate = $state(false);
	const activeHref = $derived(nav.flatMap((g) => g.items).find((i) => isActive(i.href))?.href ?? null);
	$effect(() => {
		void activeHref;
		const el = navEl?.querySelector<HTMLElement>('[aria-current="page"]');
		indicator = el ? { top: el.offsetTop, height: el.offsetHeight } : null;
		// Posisi pertama dipasang tanpa animasi agar tidak meluncur dari atas saat halaman dibuka.
		if (indicator && !animate) requestAnimationFrame(() => (animate = true));
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
		company: Building2,
		users: Users,
		accounts: ListTree,
		rules: WandSparkles,
		wallet: Wallet
	};
	const groupLabel = (label: string | null, i: number) => label ?? (i === 0 ? 'Menu Utama' : null);
</script>

<div class="flex h-full flex-col px-4 py-6">
	<a href="/dashboard" onclick={onnavigate} class="mb-6 flex items-center gap-2.5 px-2 text-lg font-extrabold tracking-tight text-green">
		<span class="icon-tile icon-tile-deep size-9 rounded-xl font-black">J</span>
		Jurnalku.
	</a>

	<nav bind:this={navEl} class="relative flex-1 space-y-1" aria-label="Menu utama">
		{#if indicator}
			<span
				class="nav-indicator pointer-events-none absolute inset-x-0 top-0 rounded-xl bg-pale {animate ? 'is-animated' : ''}"
				style:transform="translateY({indicator.top}px)"
				style:height="{indicator.height}px"
				aria-hidden="true"
			>
				<span class="absolute top-1.5 bottom-1.5 -left-4 w-1 rounded-r bg-green"></span>
			</span>
		{/if}
		{#each nav as group, gi (gi)}
			{@const label = groupLabel(group.label, gi)}
			{#if label}
				<p class="px-2 pt-4 pb-1.5 text-[11px] font-semibold text-ink/55">{label}</p>
			{/if}
			{#each group.items as item (item.href)}
				{@const Icon = ICONS[item.icon] ?? LayoutDashboard}
				{@const active = isActive(item.href)}
				<a
					href={item.href}
					onclick={onnavigate}
					aria-current={active ? 'page' : undefined}
					class="group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors duration-200 {active
						? 'font-semibold text-deep'
						: 'text-ink/65 hover:bg-pale/50 hover:text-deep'}"
				>
					<span class="relative flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 {active ? 'icon-tile icon-tile-solid' : 'bg-muted text-ink/55 group-hover:text-deep'}">
						<Icon class="size-4" />
					</span>
					<span class="relative min-w-0 flex-1 truncate">{item.label}</span>
					<ChevronRight class="relative size-3.5 shrink-0 opacity-35 transition-transform duration-200 group-hover:translate-x-0.5" />
				</a>
			{/each}
		{/each}
	</nav>

	{#if nextStep}
		<NextStepCard step={nextStep} {onnavigate} />
	{/if}

	<div class="mt-5 flex items-center gap-3 border-t border-border pt-4">
		<a href="/profile" onclick={onnavigate} class="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 transition-colors hover:bg-pale" title="Profil Saya">
			<UserAvatar name={userName} image={userImage} class="size-9 text-xs" />
			<span class="min-w-0">
				<span class="block truncate text-sm font-semibold">{userName}</span>
				<span class="block text-xs text-muted-foreground">{roleLabel}</span>
			</span>
		</a>
		<form method="POST" action="/logout">
			<button class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5" aria-label="Keluar">
				<LogOut class="size-3.5" /> Keluar
			</button>
		</form>
	</div>
</div>
