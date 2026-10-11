<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { ROLE_LABELS } from '$lib/roles';

	let { data, children } = $props();
	const ctx = $derived(data.ctx);

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

	const isActive = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<div class="flex min-h-screen bg-slate-50">
	<aside class="flex w-64 shrink-0 flex-col border-r bg-white">
		<div class="border-b p-4">
			<a href="/dashboard" class="text-lg font-semibold">Jurnalku</a>
			{#if ctx.companies.length > 0}
				<select
					class="mt-3 w-full rounded-md border px-2 py-1.5 text-sm"
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
				<a href="/settings/company?new=1" class="mt-2 block text-xs text-blue-600 hover:underline">+ Perusahaan baru</a>
			{/if}
		</div>
		<nav class="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
			{#each data.nav as group, gi (gi)}
				<div>
					{#if group.label}
						<p class="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{group.label}</p>
					{/if}
					{#each group.items as item (item.href)}
						<a
							href={item.href}
							class="block rounded-md px-2 py-1.5 hover:bg-slate-100 {isActive(item.href) ? 'bg-slate-100 font-medium' : ''}"
						>
							{item.label}
						</a>
					{/each}
				</div>
			{/each}
		</nav>
		<div class="border-t p-4 text-sm">
			<p class="font-medium">{ctx.user.name}</p>
			<p class="text-xs text-slate-500">
				{ctx.user.isSuperAdmin ? 'Super Admin' : ctx.role ? ROLE_LABELS[ctx.role] : '—'}
			</p>
			<form method="POST" action="/logout" class="mt-2">
				<button class="text-xs text-red-600 hover:underline">Keluar</button>
			</form>
		</div>
	</aside>
	<main class="min-w-0 flex-1 p-6">
		{#if ctx.companyId}
			{@render children()}
		{:else}
			<div class="mx-auto mt-20 max-w-md text-center">
				<h1 class="text-xl font-semibold">Belum terhubung ke perusahaan</h1>
				<p class="mt-2 text-slate-600">Hubungi admin agar akun Anda ditambahkan ke perusahaan.</p>
			</div>
		{/if}
	</main>
</div>
