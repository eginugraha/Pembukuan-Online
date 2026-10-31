<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ArApForm from '$lib/components/ArApForm.svelte';

	let { data } = $props();
</script>

<PageHeader
	title={data.kind === 'AR' ? 'Buat Piutang (AR)' : 'Buat Hutang (AP)'}
	description={data.kind === 'AR' ? 'Catat piutang ke pelanggan, dengan atau tanpa termin.' : 'Catat hutang ke pemasok, dengan atau tanpa termin.'}
/>
{#key data.kind}
	<ArApForm kind={data.kind} contacts={data.contacts} linkable={data.linkable} />
{/key}
