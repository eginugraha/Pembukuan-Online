<script lang="ts">
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import Menu from '@lucide/svelte/icons/menu';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import SidebarToggle from '$lib/components/SidebarToggle.svelte';
	import ThemeSelect from '$lib/components/ThemeSelect.svelte';
	import SimpleSelect from '$lib/components/SimpleSelect.svelte';
	import { ROLE_LABELS } from '$lib/roles';
	import { Button } from '$lib/components/ui/button/index.js';
	import { applySidebar, readSidebar } from '$lib/sidebar';

	let { data, children } = $props();
	const ctx = $derived(data.ctx);
	let drawerOpen = $state(false);
	// Status ciut sidebar desktop; tampilan awal sudah benar lewat atribut data-sidebar dari app.html.
	let collapsed = $state(false);
	onMount(() => (collapsed = readSidebar() === 'collapsed'));
	function toggleSidebar() {
		collapsed = !collapsed;
		applySidebar(collapsed ? 'collapsed' : 'expanded');
	}

	async function switchCompany(companyId: string) {
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

<!-- pb-10 = tinggi footer tetap, agar konten paling bawah tidak tertutup. -->
<div class="min-h-screen bg-background pb-10">
	<div class="flex min-h-[calc(100vh-2.5rem)]">
		<!-- Sidebar desktop: terkunci ke viewport di atas footer (fixed, bukan sticky, agar tidak bergeser
		     di ujung scroll); logo & bagian bawah tetap, hanya menu yang scroll. -->
		<aside id="app-sidebar" data-rail class="fixed top-0 bottom-10 left-0 z-20 hidden w-64 border-r border-border bg-background transition-[width] duration-200 motion-reduce:transition-none lg:block rail-collapsed:w-16">
			<div class="h-full">
				<AppSidebar nav={data.nav} {isActive} nextStep={data.nextStep} {collapsed} />
			</div>
		</aside>

		<!-- Drawer HP/tablet -->
		{#if drawerOpen}
			<div id="mobile-drawer" bind:this={drawerEl} class="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" tabindex="-1" onkeydown={trapTab}>
				<button class="drawer-backdrop absolute inset-0 bg-ink/40 backdrop-blur-[2px]" tabindex="-1" aria-hidden="true" onclick={closeDrawer}></button>
				<aside class="drawer-panel absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-background shadow-2xl">
					<button bind:this={closeBtn} class="absolute top-5 right-4 rounded-lg p-1.5 text-ink/60 hover:bg-muted" aria-label="Tutup menu" onclick={closeDrawer}>
						<X class="size-5" />
					</button>
					<AppSidebar nav={data.nav} {isActive} nextStep={data.nextStep} onnavigate={closeDrawer} />
				</aside>
			</div>
		{/if}

		<div class="flex min-w-0 flex-1 flex-col transition-[padding] duration-200 motion-reduce:transition-none lg:pl-64 lg:sb-collapsed:pl-16 bg-[linear-gradient(var(--header-tint)_0,var(--header-tint)_260px,var(--background)_260px)]">
			<header class="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
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
				<SidebarToggle {collapsed} ontoggle={toggleSidebar} />
				{#if ctx.companies.length > 0}
					<SimpleSelect
						class="max-w-[45vw] border-border bg-card font-semibold sm:max-w-xs"
						value={ctx.companyId ?? ''}
						options={ctx.companies.map((c) => ({ value: c.id, label: c.name }))}
						aria-label="Pilih perusahaan"
						onchange={switchCompany}
					/>
				{/if}
				{#if ctx.user.isSuperAdmin}
					<Button
						href="/settings/company?new=1"
						variant="outline"
						aria-label="Perusahaan baru"
						title="Perusahaan baru"
						class="shrink-0 text-deep max-sm:size-10 max-sm:px-0"
					>
						<Plus class="size-4" /><span class="hidden sm:inline">Perusahaan baru</span>
					</Button>
				{/if}
				<div class="ml-auto flex items-center gap-2">
					<ThemeSelect />
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
	<AppFooter />
</div>
