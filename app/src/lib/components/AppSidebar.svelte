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
	import type { NavGroup } from '$lib/nav';
	import type { NextStep } from '$lib/server/dashboard/next-step';

	let {
		nav,
		isActive,
		nextStep,
		userName,
		roleLabel,
		onnavigate
	}: {
		nav: NavGroup[];
		isActive: (href: string) => boolean;
		nextStep: NextStep | null;
		userName: string;
		roleLabel: string;
		onnavigate?: () => void;
	} = $props();

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
		<span class="tile-3d size-9 rounded-xl font-black text-white">J</span>
		Jurnalku.
	</a>

	<nav class="flex-1 space-y-1 overflow-y-auto" aria-label="Menu utama">
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
					class="group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors {active
						? 'bg-pale font-semibold text-deep before:absolute before:top-1.5 before:bottom-1.5 before:-left-4 before:w-1 before:rounded-r before:bg-green'
						: 'text-ink/65 hover:bg-pale/60 hover:text-deep'}"
				>
					<span class="flex size-7 shrink-0 items-center justify-center rounded-lg {active ? 'tile-3d' : 'bg-muted text-ink/55 group-hover:text-deep'}">
						<Icon class="size-4" />
					</span>
					<span class="min-w-0 flex-1 truncate">{item.label}</span>
					<ChevronRight class="size-3.5 shrink-0 opacity-35" />
				</a>
			{/each}
		{/each}
	</nav>

	{#if nextStep}
		<NextStepCard step={nextStep} {onnavigate} />
	{/if}

	<div class="mt-5 flex items-center gap-3 border-t border-border pt-4">
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-semibold">{userName}</p>
			<p class="text-xs text-muted-foreground">{roleLabel}</p>
		</div>
		<form method="POST" action="/logout">
			<button class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5" aria-label="Keluar">
				<LogOut class="size-3.5" /> Keluar
			</button>
		</form>
	</div>
</div>
