<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDate } from '$lib/dates';
	import { roleAtLeast } from '$lib/roles';
	import { page } from '$app/state';

	let { data } = $props();
	const canUpload = $derived(roleAtLeast(page.data.ctx?.role, 'accountant'));
</script>

<PageHeader title="Riwayat Upload" description="Semua eStatement yang pernah diunggah untuk perusahaan ini.">
	{#snippet actions()}
		{#if canUpload}<Button href="/uploads/new">Upload Baru</Button>{/if}
	{/snippet}
</PageHeader>

{#if data.uploads.length === 0}
	<p class="panel p-8 text-center text-muted-foreground">Belum ada eStatement yang diunggah.</p>
{:else}
	<div class="panel px-2 py-1">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>File</Table.Head>
				<Table.Head>Rekening</Table.Head>
				<Table.Head>Periode</Table.Head>
				<Table.Head>Status</Table.Head>
				<Table.Head class="text-right">Belum dikonfirmasi</Table.Head>
				<Table.Head>Diunggah</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.uploads as u (u.id)}
				<Table.Row>
					<Table.Cell><a class="font-medium text-deep hover:underline" href="/uploads/{u.id}">{u.filename}</a></Table.Cell>
					<Table.Cell>{u.accountNo}</Table.Cell>
					<Table.Cell>{formatDate(u.periodStart)} – {formatDate(u.periodEnd)}</Table.Cell>
					<Table.Cell><StatusBadge status={u.status} /></Table.Cell>
					<Table.Cell class="text-right tabular-nums">{u.pending} / {u.total}</Table.Cell>
					<Table.Cell>{new Date(u.uploadedAt).toLocaleString('id-ID')}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
	</div>
{/if}
