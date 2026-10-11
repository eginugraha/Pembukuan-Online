<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { status }: { status: 'processing' | 'review' | 'done' | 'error' } = $props();

	const labels = { processing: 'Memproses', review: 'Perlu review', done: 'Selesai', error: 'Error' } as const;
	const variants = { processing: 'secondary', review: 'outline', done: 'default', error: 'destructive' } as const;
</script>

<Badge variant={variants[status]}>{labels[status]}</Badge>
