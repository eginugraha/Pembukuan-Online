<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import type { SignerOption } from '$lib/server/company/signers';

	type Props = {
		/** URL PDF tanpa parameter penandatangan. */
		href: string;
		signers: SignerOption[];
		/** Penandatangan pada unduhan terakhir dokumen ini; jadi pilihan awal. */
		lastSignerId: string | null;
		label: string;
		variant?: 'default' | 'outline' | 'ghost';
		size?: 'default' | 'sm';
	};
	let { href, signers, lastSignerId, label, variant = 'default', size = 'default' }: Props = $props();

	let open = $state(false);
	let chosen = $state('');
	const initial = $derived(signers.find((s) => s.id === lastSignerId)?.id ?? signers[0]?.id ?? '');

	function show() {
		chosen = initial;
		open = true;
	}
	function onDownload() {
		open = false;
		// Unduhan terakhir baru tercatat di server; muat ulang agar pilihan awalnya ikut berubah.
		setTimeout(() => invalidateAll(), 1000);
	}
</script>

{#if signers.length <= 1}
	<Button {variant} {size} {href}>{label}</Button>
{:else}
	<Button {variant} {size} onclick={show}>{label}</Button>
	<Dialog.Root bind:open>
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>Pilih penandatangan</Dialog.Title>
				<Dialog.Description>Penandatangan tampil di bagian bawah PDF.</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-2" role="radiogroup" aria-label="Penandatangan">
				{#each signers as s (s.id)}
					<label class="flex cursor-pointer items-center gap-3 rounded-md border p-3 has-[:checked]:border-deep has-[:checked]:bg-muted">
						<input type="radio" name="signer" value={s.id} bind:group={chosen} />
						<span>
							<span class="block font-medium">{s.name}</span>
							{#if s.title}<span class="block text-sm text-muted-foreground">{s.title}</span>{/if}
						</span>
					</label>
				{/each}
			</div>
			<Dialog.Footer>
				<Button variant="ghost" onclick={() => (open = false)}>Batal</Button>
				<Button href="{href}?signer={chosen}" onclick={onDownload}>Unduh</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
