<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { status }: { status: 'processing' | 'review' | 'done' | 'error' } = $props();

	const labels = { processing: 'Memproses', review: 'Perlu review', done: 'Selesai', error: 'Error' } as const;
	const variants = { processing: 'muted', review: 'warning', done: 'success', error: 'destructive' } as const;
</script>

<Badge variant={variants[status]}>
	{#if status === 'processing'}<span class="size-1.5 animate-pulse rounded-full bg-current"></span>{/if}
	{labels[status]}
</Badge>
