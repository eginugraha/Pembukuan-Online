<script lang="ts">
	import { onMount } from 'svelte';
	import Bold from '@lucide/svelte/icons/bold';
	import Italic from '@lucide/svelte/icons/italic';
	import Underline from '@lucide/svelte/icons/underline';
	import Strikethrough from '@lucide/svelte/icons/strikethrough';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import List from '@lucide/svelte/icons/list';
	import { notesHtml } from '$lib/rich-text';

	let {
		value = $bindable(''),
		id,
		onblur,
		'aria-invalid': ariaInvalid,
		'aria-describedby': ariaDescribedby
	}: {
		value?: string;
		id: string;
		onblur?: () => void;
		'aria-invalid'?: 'true' | undefined;
		'aria-describedby'?: string;
	} = $props();

	const TOOLS = [
		{ cmd: 'bold', label: 'Tebal (Ctrl+B)', icon: Bold },
		{ cmd: 'italic', label: 'Miring (Ctrl+I)', icon: Italic },
		{ cmd: 'underline', label: 'Garis bawah (Ctrl+U)', icon: Underline },
		{ cmd: 'strikeThrough', label: 'Coret', icon: Strikethrough },
		{ cmd: 'insertOrderedList', label: 'Daftar bernomor', icon: ListOrdered },
		{ cmd: 'insertUnorderedList', label: 'Daftar poin', icon: List }
	] as const;

	let el = $state<HTMLDivElement>();
	let active = $state<Record<string, boolean>>({});
	// Nilai terakhir yang kita kirim ke induk, supaya perubahan dari luar bisa dibedakan dari ketikan sendiri.
	let emitted = '';

	/** Isi editor dikirim sebagai HTML; server membersihkannya ulang, jadi ini hanya format antar-muka. */
	function emit() {
		if (!el) return;
		emitted = el.textContent?.trim() ? `<div>${el.innerHTML}</div>` : '';
		value = emitted;
	}

	function refreshActive() {
		if (!el || !el.contains(document.getSelection()?.anchorNode ?? null)) return;
		const next: Record<string, boolean> = {};
		for (const t of TOOLS) next[t.cmd] = document.queryCommandState(t.cmd);
		active = next;
	}

	function run(cmd: string) {
		el?.focus();
		document.execCommand(cmd);
		emit();
		refreshActive();
	}

	// Tempel sebagai teks biasa: tidak membawa gaya atau markup dari sumber lain.
	function onpaste(e: ClipboardEvent) {
		e.preventDefault();
		document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
	}

	onMount(() => {
		if (el) el.innerHTML = notesHtml(value);
		emitted = value;
		document.addEventListener('selectionchange', refreshActive);
		return () => document.removeEventListener('selectionchange', refreshActive);
	});

	$effect(() => {
		if (el && value !== emitted) {
			el.innerHTML = notesHtml(value);
			emitted = value;
		}
	});
</script>

<div
	class="rounded-xl border border-input bg-field shadow-[0_2px_8px_-6px_rgb(20_33_15/0.25)] transition-shadow focus-within:border-green focus-within:ring-3 focus-within:ring-green/25 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
	aria-invalid={ariaInvalid}
>
	<div class="flex flex-wrap items-center gap-0.5 border-b border-input px-1.5 py-1" role="toolbar" aria-label="Format teks">
		{#each TOOLS as t (t.cmd)}
			<button
				type="button"
				title={t.label}
				aria-label={t.label}
				aria-pressed={active[t.cmd] ? 'true' : 'false'}
				class="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-ink aria-pressed:bg-muted aria-pressed:text-ink"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => run(t.cmd)}
			>
				<t.icon class="size-4" aria-hidden="true" />
			</button>
		{/each}
	</div>
	<div
		bind:this={el}
		{id}
		role="textbox"
		tabindex="0"
		aria-multiline="true"
		aria-label="Catatan (opsional)"
		aria-describedby={ariaDescribedby}
		contenteditable="true"
		class="rich-notes min-h-48 resize-y overflow-auto px-3 py-2 text-sm focus-visible:outline-none"
		oninput={emit}
		{onpaste}
		{onblur}
	></div>
</div>
