<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { formatDate } from '$lib/dates';

	let { data } = $props();
</script>

<PageHeader title="Dashboard" />

<div class="grid gap-4 md:grid-cols-3">
	<Card.Root>
		<Card.Header><Card.Description>Menunggu konfirmasi</Card.Description><Card.Title class="text-3xl">{data.pendingCount}</Card.Title></Card.Header>
		<Card.Content><a href="/review" class="text-sm text-blue-600 hover:underline">Buka Review & Konfirmasi</a></Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Neraca Saldo per {formatDate(data.trialBalance.asOf)}</Card.Description>
			<Card.Title class="text-3xl {data.trialBalance.balanced ? 'text-green-700' : 'text-red-700'}">{data.trialBalance.balanced ? 'Balance' : 'Tidak balance'}</Card.Title>
		</Card.Header>
		<Card.Content><a href="/trial-balance" class="text-sm text-blue-600 hover:underline">Lihat Neraca Saldo</a></Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header><Card.Description>Saldo awal</Card.Description><Card.Title class="text-xl">{data.hasOpening ? 'Sudah diisi' : 'Belum diisi'}</Card.Title></Card.Header>
		<Card.Content><a href="/settings/opening-balance" class="text-sm text-blue-600 hover:underline">Atur Saldo Awal</a></Card.Content>
	</Card.Root>
</div>

<h2 class="mt-8 mb-3 font-medium">Upload terakhir</h2>
{#if data.recentUploads.length === 0}
	<p class="text-slate-500">Belum ada upload. <a href="/uploads/new" class="text-blue-600 hover:underline">Unggah eStatement pertama</a>.</p>
{:else}
	<ul class="divide-y rounded-md border bg-white">
		{#each data.recentUploads as u (u.id)}
			<li class="flex items-center justify-between p-3 text-sm">
				<a href="/uploads/{u.id}" class="hover:underline">{u.filename} · {formatDate(u.periodStart)} – {formatDate(u.periodEnd)}</a>
				<StatusBadge status={u.status} />
			</li>
		{/each}
	</ul>
{/if}
