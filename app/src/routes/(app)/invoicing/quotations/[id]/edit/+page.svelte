<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DocumentForm from '$lib/components/DocumentForm.svelte';

	let { data } = $props();
	const q = $derived(data.quotation);
</script>

<PageHeader title="Ubah Penawaran" description={q.quotationNo} crumb={q.quotationNo} />
<DocumentForm
	kind="quotation"
	contacts={data.contacts}
	docId={q.id}
	initial={{
		contactId: q.contactId,
		issueDate: q.issueDate,
		validUntil: q.validUntil ?? '',
		discount: Number(q.discount) > 0 ? q.discount : '',
		taxRate: q.taxRate ?? '',
		notes: q.notes ?? '',
		subject: q.subject ?? '',
		currency: q.currency,
		lines: q.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }))
	}}
/>
