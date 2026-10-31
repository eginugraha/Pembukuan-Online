<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let {
		open = $bindable(false),
		title,
		name,
		busy,
		onconfirm,
		note
	}: { open: boolean; title: string; name: string; busy: boolean; onconfirm: () => void; note?: string } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{name} akan dihapus dari daftar. Tindakan ini tidak bisa dibatalkan dari aplikasi.{#if note} {note}{/if}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (open = false)}>Batal</Button>
			<Button type="button" variant="destructive" disabled={busy} onclick={onconfirm}>Hapus</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
