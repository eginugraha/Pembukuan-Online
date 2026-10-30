<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ArApForm from '$lib/components/ArApForm.svelte';

	let { data } = $props();
	const entry = $derived(data.entry);
</script>

<PageHeader title={entry.kind === 'AR' ? 'Ubah Piutang (AR)' : 'Ubah Hutang (AP)'} description={entry.title} crumb={entry.title} />
<ArApForm kind={entry.kind} contacts={data.contacts} linkable={data.linkable} {entry} />
