<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DocumentForm from '$lib/components/DocumentForm.svelte';

	let { data } = $props();
</script>

<PageHeader title="Buat Penawaran" description="Nomor penawaran dibuat otomatis saat disimpan." />
<DocumentForm kind="quotation" contacts={data.contacts} companyCode={data.companyCode} canEditCompany={data.canEditCompany} />
