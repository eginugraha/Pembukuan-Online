<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import FileText from '@lucide/svelte/icons/file-text';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { apiFetch } from '$lib/api-client';

	let file = $state<File | null>(null);
	let dragging = $state(false);
	let busy = $state(false);
	let errorMessage = $state<string | null>(null);

	function pick(files: FileList | null | undefined) {
		errorMessage = null;
		file = files?.[0] ?? null;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!file) return;
		busy = true;
		errorMessage = null;
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await apiFetch<{ id: string }>('/api/uploads', { method: 'POST', body });
			await goto(`/uploads/${res.id}`);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Upload gagal';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Upload eStatement" description="Unggah eStatement BCA (PDF) dari KlikBCA / m-BCA. File tidak disimpan setelah diproses." />

<Card.Root class="max-w-xl">
	<Card.Content class="pt-6">
		<form class="space-y-4" onsubmit={submit}>
			<label
				class="flex cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed p-10 text-center transition-colors {dragging ? 'border-green bg-pale' : 'border-green/35 bg-[#fbfcfb] hover:border-green/60 hover:bg-pale/50'}"
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(e) => {
					e.preventDefault();
					dragging = false;
					pick(e.dataTransfer?.files);
				}}
			>
				<span class="icon-tile icon-tile-solid mb-4 size-16 rounded-2xl">
					{#if file}<FileText class="size-7" />{:else}<UploadIcon class="size-7" />{/if}
				</span>
				<span class="font-semibold break-all">{file ? file.name : 'Seret file PDF ke sini atau klik untuk memilih'}</span>
				<span class="mt-1 text-xs text-muted-foreground">Maksimal 10 MB</span>
				<input type="file" accept="application/pdf,.pdf" class="sr-only" onchange={(e) => pick(e.currentTarget.files)} />
			</label>
			{#if errorMessage}
				<Alert.Root variant="destructive">
					<Alert.Title>Upload gagal</Alert.Title>
					<Alert.Description>{errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}
			<Button type="submit" disabled={!file || busy}>{busy ? 'Memproses…' : 'Unggah'}</Button>
		</form>
	</Card.Content>
</Card.Root>
