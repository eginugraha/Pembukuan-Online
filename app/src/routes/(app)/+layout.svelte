<script lang="ts">
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import Menu from '@lucide/svelte/icons/menu';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { ROLE_LABELS } from '$lib/roles';

	let { data, children } = $props();
	const ctx = $derived(data.ctx);
	let drawerOpen = $state(false);

	async function switchCompany(e: Event) {
		const companyId = (e.currentTarget as HTMLSelectElement).value;
		await fetch('/api/companies/switch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ companyId })
		});
		await invalidateAll();
		await goto('/dashboard');
	}

	const matches = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	// Hanya item dengan prefix terpanjang yang aktif (mis. /uploads/new tidak ikut menyorot /uploads).
	const activeHref = $derived(
		data.nav
			.flatMap((g) => g.items.map((i) => i.href))
			.filter(matches)
			.sort((a, b) => b.length - a.length)[0] ?? null
	);
	const isActive = (href: string) => href === activeHref;
	const roleLabel = $derived(ctx.user.isSuperAdmin ? 'Super Admin' : ctx.role ? ROLE_LABELS[ctx.role] : '—');
	let trigger = $state<HTMLButtonElement | null>(null);
	let drawerEl = $state<HTMLDivElement | null>(null);
	let closeBtn = $state<HTMLButtonElement | null>(null);

	async function openDrawer() {
		drawerOpen = true;
		await tick();
		closeBtn?.focus();
	}
	function closeDrawer() {
		if (!drawerOpen) return;
		drawerOpen = false;
		trigger?.focus();
	}
	// Fokus tidak boleh keluar dari drawer modal selama terbuka.
	function trapTab(e: KeyboardEvent) {
		if (e.key !== 'Tab' || !drawerEl) return;
		const items = [...drawerEl.querySelectorAll<HTMLElement>('a[href], button:not([tabindex="-1"]), select, input')];
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
	afterNavigate(() => {
		drawerOpen = false;
	});

</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && closeDrawer()} />

<div class="min-h-screen bg-background">
	<div class="flex min-h-screen">
		<!-- Sidebar desktop: menempel setinggi layar; hanya konten yang ikut scroll. -->
		<aside class="hidden w-64 shrink-0 border-r border-border bg-background lg:block">
			<div class="sticky top-0 h-screen overflow-y-auto overscroll-contain">
				<AppSidebar nav={data.nav} {isActive} nextStep={data.nextStep} userName={ctx.user.name} userImage={ctx.user.image} {roleLabel} />
			</div>
		</aside>

		<!-- Drawer HP/tablet -->
		{#if drawerOpen}
			<div id="mobile-drawer" bind:this={drawerEl} class="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" tabindex="-1" onkeydown={trapTab}>
				<button class="drawer-backdrop absolute inset-0 bg-ink/40 backdrop-blur-[2px]" tabindex="-1" aria-hidden="true" onclick={closeDrawer}></button>
				<aside class="drawer-panel absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-background shadow-2xl">
					<button bind:this={closeBtn} class="absolute top-5 right-4 rounded-lg p-1.5 text-ink/60 hover:bg-muted" aria-label="Tutup menu" onclick={closeDrawer}>
						<X class="size-5" />
					</button>
					<AppSidebar nav={data.nav} {isActive} nextStep={data.nextStep} userName={ctx.user.name} userImage={ctx.user.image} {roleLabel} onnavigate={closeDrawer} />
				</aside>
			</div>
		{/if}

		<div class="flex min-w-0 flex-1 flex-col bg-[linear-gradient(var(--header-tint)_0,var(--header-tint)_260px,var(--background)_260px)]">
			<header class="flex items-center gap-3 px-4 pt-4 pb-2 sm:px-6 lg:px-8 lg:pt-6">
				<button
					bind:this={trigger}
					class="icon-tile icon-tile-muted size-10 shrink-0 lg:hidden"
					aria-label="Buka menu"
					aria-expanded={drawerOpen}
					aria-controls="mobile-drawer"
					onclick={openDrawer}
				>
					<Menu class="size-5" />
				</button>
				{#if ctx.companies.length > 0}
					<select
						class="select-chevron h-10 max-w-[45vw] min-w-0 truncate rounded-xl border border-border bg-card pl-3 pr-10 text-sm font-semibold shadow-[0_4px_14px_-8px_rgb(0_0_0/0.25)] focus-visible:ring-3 focus-visible:ring-green/25 focus-visible:outline-none sm:max-w-xs"
						value={ctx.companyId}
						onchange={switchCompany}
						aria-label="Pilih perusahaan"
					>
						{#each ctx.companies as c (c.id)}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				{/if}
				{#if ctx.user.isSuperAdmin}
					<a
						href="/settings/company?new=1"
						aria-label="Perusahaan baru"
						title="Perusahaan baru"
						class="flex size-10 shrink-0 items-center justify-center gap-1 rounded-xl text-sm font-medium text-deep hover:bg-pale sm:size-auto sm:px-2 sm:py-2 sm:hover:underline"
					>
						<Plus class="size-4" /><span class="hidden sm:inline">Perusahaan baru</span>
					</a>
				{/if}
				<div class="ml-auto flex items-center gap-2">
					<ThemeToggle />
					<ProfileMenu name={ctx.user.name} image={ctx.user.image} {roleLabel} />
				</div>
			</header>

			<main class="min-w-0 flex-1 px-4 pt-4 pb-10 sm:px-6 lg:px-8">
				{#if ctx.companyId || page.url.pathname === '/profile'}
					<!-- Animasi masuk per halaman dengan CSS biasa: tidak menutupi sidebar seperti View Transition
					     (yang memutus :hover dan membuat menu berkedip). -->
					{#key page.url.pathname}
						<div class="page-enter">{@render children()}</div>
					{/key}
				{:else}
					<div class="panel mx-auto mt-20 max-w-md p-8 text-center">
						<h1 class="text-xl font-bold">Belum terhubung ke perusahaan</h1>
						<p class="mt-2 text-muted-foreground">Hubungi admin agar akun Anda ditambahkan ke perusahaan.</p>
					</div>
				{/if}
			</main>
		</div>
	</div>
</div>
