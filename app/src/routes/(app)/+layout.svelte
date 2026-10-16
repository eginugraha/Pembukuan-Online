<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Menu from '@lucide/svelte/icons/menu';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
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
	const initials = $derived(
		ctx.user.name
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('')
	);
	const closeDrawer = () => (drawerOpen = false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && closeDrawer()} />

<div class="min-h-screen bg-white lg:bg-canvas lg:p-6">
	<div class="flex min-h-screen bg-white lg:min-h-[calc(100vh-3rem)] lg:overflow-hidden lg:rounded-[28px] lg:shadow-[0_30px_60px_-30px_rgb(30_50_30/0.35)]">
		<!-- Sidebar desktop -->
		<aside class="hidden w-64 shrink-0 border-r border-border lg:block">
			<div class="h-full">
				<AppSidebar nav={data.nav} {isActive} nextStep={data.nextStep} userName={ctx.user.name} {roleLabel} />
			</div>
		</aside>

		<!-- Drawer HP/tablet -->
		{#if drawerOpen}
			<div class="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
				<button class="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" aria-label="Tutup menu" onclick={closeDrawer}></button>
				<aside class="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-white shadow-2xl">
					<button class="absolute top-5 right-4 rounded-lg p-1.5 text-ink/60 hover:bg-muted" aria-label="Tutup menu" onclick={closeDrawer}>
						<X class="size-5" />
					</button>
					<AppSidebar nav={data.nav} {isActive} nextStep={data.nextStep} userName={ctx.user.name} {roleLabel} onnavigate={closeDrawer} />
				</aside>
			</div>
		{/if}

		<div class="flex min-w-0 flex-1 flex-col bg-[linear-gradient(#f7f9f7_0,#f7f9f7_260px,#fff_260px)]">
			<header class="flex items-center gap-3 px-4 pt-4 pb-2 sm:px-6 lg:px-8 lg:pt-6">
				<button class="tile-3d tile-3d-muted size-10 shrink-0 lg:hidden" aria-label="Buka menu" onclick={() => (drawerOpen = true)}>
					<Menu class="size-5" />
				</button>
				{#if ctx.companies.length > 0}
					<select
						class="h-10 max-w-[55vw] min-w-0 truncate rounded-xl border-0 bg-white px-3 text-sm font-semibold shadow-[0_4px_14px_-8px_rgb(0_0_0/0.25)] focus-visible:ring-3 focus-visible:ring-green/25 focus-visible:outline-none sm:max-w-xs"
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
					<a href="/settings/company?new=1" class="hidden items-center gap-1 text-sm font-medium text-deep hover:underline sm:flex">
						<Plus class="size-4" /> Perusahaan baru
					</a>
				{/if}
				<div class="ml-auto flex items-center gap-3">
					<span class="hidden text-sm font-semibold sm:inline">Halo, {ctx.user.name.split(' ')[0]}</span>
					<span class="tile-3d tile-3d-deep size-10 text-sm font-bold" title={ctx.user.name}>{initials}</span>
				</div>
			</header>

			<main class="min-w-0 flex-1 px-4 pt-4 pb-10 sm:px-6 lg:px-8">
				{#if ctx.companyId}
					{@render children()}
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
