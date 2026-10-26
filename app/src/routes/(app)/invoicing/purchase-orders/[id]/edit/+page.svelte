<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DocumentForm from '$lib/components/DocumentForm.svelte';

	let { data } = $props();
	const po = $derived(data.po);
</script>

<PageHeader title="Ubah Purchase Order" description={po.poNo} crumb={po.poNo} />
<DocumentForm
	kind="po"
	contacts={data.contacts.map((c) => ({ id: c.id, name: c.name, code: c.code }))}
	docId={po.id}
	initial={{
		contactId: po.contactId,
		issueDate: po.issueDate,
		expectedDate: po.expectedDate ?? '',
		taxRate: po.taxRate ?? '',
		notes: po.notes ?? '',
		lines: po.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }))
	}}
/>
