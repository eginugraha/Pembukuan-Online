<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { QUOTATION_STATUS_LABEL, type QuotationStatus } from '$lib/quotation-status';

	let { status }: { status: QuotationStatus } = $props();

	const variants = { pending: 'warning', approved: 'success', expired: 'muted', revised: 'muted' } as const;
</script>

<Badge variant={variants[status]}>{QUOTATION_STATUS_LABEL[status]}</Badge>
