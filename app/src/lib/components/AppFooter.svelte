<script lang="ts">
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
</script>

<!-- Footer selebar layar, menempel di bawah viewport (di bawah sidebar & konten). -->
<footer class="app-footer fixed inset-x-0 bottom-0 z-30 flex h-10 items-center justify-between gap-4 border-t border-border bg-background/95 px-4 text-xs text-muted-foreground backdrop-blur sm:px-6">
	<span class="truncate">© 2026 Pembukuan Online</span>
	<span class="flex shrink-0 items-center gap-3">
		<span class="hidden items-center gap-1.5 sm:flex"><ShieldCheck class="size-3.5 text-green" aria-hidden="true" />Data tersimpan di server Anda</span>
		<span class="rounded-md bg-muted px-1.5 py-0.5 font-medium tabular-nums">v{__APP_VERSION__}</span>
	</span>
</footer>
