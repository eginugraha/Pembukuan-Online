<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DocumentForm from '$lib/components/DocumentForm.svelte';

	let { data } = $props();

	// Dibuat dari termin AR/AP: satu baris senilai termin. Kontak yang tidak ada di daftar (mis. sudah
	// nonaktif) dikosongkan supaya pengguna memilih ulang alih-alih mengirim kontak yang pasti ditolak.
	const p = $derived(data.prefill);
	const contactMissing = $derived(!!p && !data.contacts.some((c) => c.id === p.contactId));
	const initial = $derived(
		p
			? {
					contactId: contactMissing ? '' : p.contactId,
					currency: p.currency,
					issueDate: '',
					taxRate: '',
					notes: '',
					lines: [{ description: p.title, quantity: '1', unitPrice: p.amount }]
				}
			: undefined
	);
</script>

<PageHeader title="Buat Invoice" description="Nomor invoice dibuat otomatis saat disimpan." />
{#if p}
	<p class="mb-4 text-sm text-muted-foreground">
		Dibuat dari termin <a href="/invoicing/ar-ap/{p.entryId}" class="underline">{p.title}</a>; akan ditautkan ke termin tersebut saat disimpan.
		{#if contactMissing}Kontak AR/AP tidak aktif, pilih pelanggan lain.{/if}
	</p>
{/if}
<!-- Nilai awal form dibaca sekali saat dipasang; ganti termin = pasang ulang form. -->
{#key data.termId}
	<DocumentForm kind="invoice" contacts={data.contacts} companyCode={data.companyCode} canEditCompany={data.canEditCompany} linkTermId={data.termId ?? undefined} {initial} />
{/key}
