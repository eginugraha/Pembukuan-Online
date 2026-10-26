<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { errorCopy } from '$lib/error-copy';

	let { status, message }: { status: number; message?: string } = $props();
	const copy = $derived(errorCopy(status, message));
</script>

<svelte:head><title>{status === 404 ? '404' : copy.title} · Pembukuan Online</title></svelte:head>

<div class="flex flex-col items-center gap-3 px-4 py-16 text-center">
	<p aria-hidden="true" class="text-8xl font-black tracking-tight text-green sm:text-9xl">{status}</p>
	<h1 class="text-2xl font-extrabold tracking-tight">{copy.title}</h1>
	<p class="max-w-md text-muted-foreground">{copy.body}</p>
	<div class="mt-4 flex flex-wrap justify-center gap-2">
		<Button href="/dashboard">Kembali ke Dashboard</Button>
		{#if copy.showReload}
			<Button variant="outline" onclick={() => location.reload()}>Muat ulang</Button>
		{/if}
	</div>
</div>
