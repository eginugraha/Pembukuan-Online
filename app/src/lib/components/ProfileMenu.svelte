<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import LogOut from '@lucide/svelte/icons/log-out';
	import UserRound from '@lucide/svelte/icons/user-round';
	import ConfirmLogoutDialog from '$lib/components/ConfirmLogoutDialog.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';

	let { name, image, roleLabel }: { name: string; image?: string | null; roleLabel: string } = $props();

	let open = $state(false);
	let logoutOpen = $state(false);
	let root = $state<HTMLDivElement | null>(null);
	let button = $state<HTMLButtonElement | null>(null);

	function close(focusButton = false) {
		open = false;
		if (focusButton) button?.focus();
	}
	function onWindowClick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) close();
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => open && e.key === 'Escape' && close(true)} />

<div class="relative" bind:this={root}>
	<button
		bind:this={button}
		class="flex items-center gap-2.5 rounded-xl py-1 pr-2 pl-1 transition-colors hover:bg-pale sm:pl-3"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="Menu profil"
		onclick={() => (open = !open)}
	>
		<span class="hidden text-sm font-semibold sm:inline">Halo, {name.split(' ')[0]}</span>
		<UserAvatar {name} {image} />
		<ChevronDown class="hidden size-4 text-ink/50 transition-transform sm:block {open ? 'rotate-180' : ''}" />
	</button>

	{#if open}
		<div class="profile-menu absolute top-full right-0 z-30 mt-2 w-60 rounded-2xl border border-border bg-popover p-2 shadow-[0_20px_40px_-20px_rgb(20_40_15/0.35)]" role="menu">
			<div class="flex items-center gap-3 px-2 py-2">
				<UserAvatar {name} {image} class="size-10 text-sm" />
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold">{name}</p>
					<p class="text-xs text-muted-foreground">{roleLabel}</p>
				</div>
			</div>
			<div class="my-1 h-px bg-border"></div>
			<a href="/profile" role="menuitem" onclick={() => close()} class="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-pale hover:text-deep">
				<UserRound class="size-4" /> Profil Saya
			</a>
			<button
				type="button"
				role="menuitem"
				onclick={() => {
					close();
					logoutOpen = true;
				}}
				class="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-destructive hover:bg-destructive/5"
			>
				<LogOut class="size-4" /> Keluar
			</button>
		</div>
	{/if}
</div>

<ConfirmLogoutDialog bind:open={logoutOpen} />
