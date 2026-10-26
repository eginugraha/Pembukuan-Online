<script lang="ts">
	import { page } from '$app/state';
	import ErrorView from '$lib/components/ErrorView.svelte';
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-canvas p-4">
	<a href="/dashboard" aria-label="Pembukuan Online" class="mb-6 flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-green">
		<span class="icon-tile icon-tile-deep size-9 shrink-0 rounded-xl font-black">P</span>
		<span>Pembukuan Online</span>
	</a>
	<ErrorView status={page.status} message={page.error?.message} />
</div>
