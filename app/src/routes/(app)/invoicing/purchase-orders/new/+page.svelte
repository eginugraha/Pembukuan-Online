<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DocumentForm from '$lib/components/DocumentForm.svelte';

	let { data } = $props();
</script>

<PageHeader title="Buat Purchase Order" description="Nomor PO dibuat otomatis saat disimpan." />
<DocumentForm kind="po" contacts={data.contacts} companyCode={data.companyCode} />
