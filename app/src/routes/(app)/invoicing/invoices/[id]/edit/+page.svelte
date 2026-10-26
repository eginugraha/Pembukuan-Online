<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DocumentForm from '$lib/components/DocumentForm.svelte';

	let { data } = $props();
	const inv = $derived(data.invoice);
</script>

<PageHeader title="Ubah Invoice" description={inv.invoiceNo} crumb={inv.invoiceNo} />
<DocumentForm
	kind="invoice"
	contacts={data.contacts}
	docId={inv.id}
	initial={{
		contactId: inv.contactId,
		issueDate: inv.issueDate,
		dueDate: inv.dueDate ?? '',
		discount: Number(inv.discount) > 0 ? inv.discount : '',
		taxRate: inv.taxRate ?? '',
		notes: inv.notes ?? '',
		lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }))
	}}
/>
