<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Keluar dari pena?</Dialog.Title>
			<Dialog.Description>Anda perlu masuk lagi untuk melanjutkan. Perubahan yang sudah disimpan tidak hilang.</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="/logout">
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Batal</Button>
				<Button type="submit" variant="destructive">Keluar</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
