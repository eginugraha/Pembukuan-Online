<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import FileText from '@lucide/svelte/icons/file-text';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { apiFetch, ClientApiError } from '$lib/api-client';

	const MAX_BYTES = 10 * 1024 * 1024;

	let file = $state<File | null>(null);
	let dragging = $state(false);
	let busy = $state(false);
	let errorMessage = $state<string | null>(null);
	let fileError = $state<string | null>(null);

	function pick(files: FileList | null | undefined) {
		errorMessage = null;
		const f = files?.[0] ?? null;
		// Cek cepat di browser; server tetap memvalidasi isi file.
		fileError = !f ? null : !f.name.toLowerCase().endsWith('.pdf') ? 'File harus berformat PDF' : f.size > MAX_BYTES ? 'Ukuran file maksimal 10 MB' : null;
		file = fileError ? null : f;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!file) {
			fileError ??= 'Pilih file PDF terlebih dahulu';
			return;
		}
		busy = true;
		errorMessage = fileError = null;
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await apiFetch<{ id: string }>('/api/uploads', { method: 'POST', body });
			await goto(`/uploads/${res.id}`);
		} catch (err) {
			if (err instanceof ClientApiError && err.fields.file) fileError = err.fields.file;
			else errorMessage = err instanceof Error ? err.message : 'Upload gagal';
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
				class="flex cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed p-10 text-center transition-colors {fileError ? 'border-destructive/60' : dragging ? 'border-green bg-pale' : 'border-green/35 bg-surface-soft hover:border-green/60 hover:bg-pale/50'}"
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
				<input type="file" accept="application/pdf,.pdf" class="sr-only" aria-invalid={fileError ? 'true' : undefined} aria-describedby={fileError ? 'file-error' : undefined} onchange={(e) => pick(e.currentTarget.files)} />
			</label>
			{#if fileError}<p id="file-error" role="alert" class="flex items-center gap-1.5 text-sm font-medium text-destructive"><CircleAlert class="size-4" aria-hidden="true" />{fileError}</p>{/if}
			{#if errorMessage}
				<Alert.Root variant="destructive">
					<Alert.Title>Upload gagal</Alert.Title>
					<Alert.Description>{errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}
			<Button type="submit" disabled={busy}>{busy ? 'Memproses…' : 'Unggah'}</Button>
		</form>
	</Card.Content>
</Card.Root>
