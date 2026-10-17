<script lang="ts">
	import { cn } from '$lib/utils';

	let { name, image, class: className = 'size-10 text-sm' }: { name: string; image?: string | null; class?: string } = $props();

	let failed = $state(false);
	$effect(() => {
		// Reset bila URL foto berganti (mis. setelah upload baru).
		void image;
		failed = false;
	});
	const initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]!.toUpperCase())
			.join('') || '?'
	);
</script>

{#if image && !failed}
	<img src={image} alt="Foto {name}" class={cn('shrink-0 rounded-xl object-cover', className)} onerror={() => (failed = true)} />
{:else}
	<span class={cn('icon-tile icon-tile-deep shrink-0 font-bold', className)} title={name} aria-hidden="true">{initials}</span>
{/if}
