<script lang="ts">
	import type { DashboardView } from '$lib/server/reports/dashboard';

	let { upload, companyName, canUpload }: { upload: DashboardView['latestUpload']; companyName: string; canUpload: boolean } = $props();

	// "1234567890" → "1234 5678 90" agar terbaca seperti nomor kartu.
	const grouped = (no: string) => no.replace(/(.{4})(?=.)/g, '$1 ');
	const mmYY = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
</script>

<div
	class="relative flex min-h-40 flex-col justify-between overflow-hidden rounded-[22px] bg-[radial-gradient(circle_at_85%_5%,rgb(255_255_255/0.55)_0_22%,transparent_23%),radial-gradient(circle_at_105%_45%,rgb(255_255_255/0.35)_0_32%,transparent_33%),linear-gradient(135deg,var(--lime),var(--lime-2))] p-5 text-ink shadow-[0_22px_34px_-20px_var(--green)]"
>
	<div class="flex">
		<span class="size-6 rounded-full bg-ink"></span><span class="-ml-2.5 size-6 rounded-full bg-ink/35"></span>
	</div>
	{#if upload}
		<div>
			<p class="text-[9px] font-semibold tracking-wider text-ink/60 uppercase">Nomor rekening</p>
			<p class="truncate text-lg font-bold tracking-[0.14em] tabular-nums">{grouped(upload.accountNo)}</p>
		</div>
		<div class="flex items-end justify-between gap-3">
			<div class="min-w-0">
				<p class="text-[9px] font-semibold tracking-wider text-ink/60 uppercase">Perusahaan</p>
				<p class="truncate text-sm font-bold">{companyName}</p>
			</div>
			<div class="shrink-0 text-right">
				<p class="text-[9px] font-semibold tracking-wider text-ink/60 uppercase">Periode</p>
				<p class="text-sm font-bold tabular-nums">{mmYY(upload.periodEnd)}</p>
			</div>
		</div>
	{:else}
		<div>
			<p class="text-sm font-bold">Belum ada eStatement</p>
			<p class="text-xs text-ink/70">Unggah eStatement BCA pertama untuk mulai membukukan.</p>
			{#if canUpload}
				<a href="/uploads/new" class="mt-3 inline-block rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-deep shadow-[0_8px_16px_-10px_rgb(0_0_0/0.35)]">Upload sekarang</a>
			{/if}
		</div>
	{/if}
</div>
