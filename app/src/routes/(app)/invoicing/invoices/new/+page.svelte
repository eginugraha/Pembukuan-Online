<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DocumentForm from '$lib/components/DocumentForm.svelte';

	let { data } = $props();
</script>

<PageHeader title="Buat Invoice" description="Nomor invoice dibuat otomatis saat disimpan." />
<DocumentForm kind="invoice" contacts={data.contacts} companyCode={data.companyCode} />
